import {parse} from 'postcss';

// Email presentation only: no remote CSS, executable values or page overlays.
const emailProperties = /^(?:background(?:-color)?|color|display|visibility|opacity|width|min-width|max-width|height|min-height|max-height|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width|radius))?|border-collapse|border-spacing|border-radius|box-sizing|box-shadow|font(?:-(?:family|size|weight|style|variant|stretch))?|line-height|letter-spacing|word-spacing|text-(?:align|decoration|transform|indent|overflow)|vertical-align|white-space|word-break|overflow-wrap|overflow(?:-x|-y)?|float|clear|table-layout|list-style(?:-type|-position)?|-webkit-text-size-adjust|-ms-text-size-adjust|mso-(?:line-height-rule|padding-alt|table-lspace|table-rspace|hide))$/i;

export function cleanNewsletterCss(source, inline = false) {
  try {
    const root = parse(inline ? `email{${source}}` : source, {from: undefined});
    root.walkComments(comment => {comment.remove();});
    root.walkAtRules(rule => {
      if (inline || rule.name.toLowerCase() !== 'media' || !rule.nodes || !/^[a-z0-9\s():.,<>=_/-]+$/i.test(rule.params)) rule.remove();
    });
    root.walkRules(rule => {
      if (!/^[a-z0-9\s.#:_>+~*,\-\[\]="'()%]+$/i.test(rule.selector)) rule.remove();
    });
    root.walkDecls(declaration => {
      const value = declaration.value.replace(/\/\*[\s\S]*?\*\//g, '');
      if (!emailProperties.test(declaration.prop) || /[<>\\@]/.test(value) || /\b(?:url|expression|var|attr|image-set|paint)\s*\(/i.test(value) || /(?:javascript|vbscript|data)\s*:/i.test(value)) declaration.remove();
      else declaration.value = value;
    });
    if (inline) {
      const rule = root.first;
      if (rule?.type !== 'rule' || root.nodes.length !== 1) return '';
      return rule.nodes?.filter(node => node.type === 'decl').map(node => node.toString()).join(';') || '';
    }
    return root.toString();
  } catch {return '';}
}
