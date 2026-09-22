"""Concurrent budget check, restricted to the local disposable CI database."""
import concurrent.futures
import json
import os
import subprocess
from pathlib import Path
if os.environ.get('PGHOST') != 'localhost' or os.environ.get('PGDATABASE') != 'nufi_ci':
    raise SystemExit('This destructive fixture test only runs against the local nufi_ci database.')
def sql(query):
    return subprocess.check_output(['psql','-X','-h','127.0.0.1','-U','postgres','-d','nufi_ci','-v','ON_ERROR_STOP=1','-At','-c',query],text=True).strip()
sql("delete from public.nufi_login_limits where bucket in ('all',repeat('b',64))")
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
    answers=list(pool.map(lambda _:sql("select public.nufi_consume_password_attempt(repeat('b',64))->>'allowed'"),range(20)))
assert answers.count('true') == 10 and answers.count('false') == 10, answers
sql("delete from public.nufi_login_limits where bucket in ('all',repeat('b',64))")
report={'disposableDatabaseOnly':True,'connections':20,'permitted':10,'denied':10,'status':'passed'}
Path('test-results').mkdir(exist_ok=True)
Path('test-results/provisioned-login-race.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
