# Suppliers

Products → Suppliers is the private team directory for supplier services and contact details. Search by company, services, contact or notes; filter Active, Prospective and Inactive suppliers.

The default view is a readable document. Administrators add and edit supplier records through a separate form. Team accounts with Content library access can read the directory; no edit permission is implied. Records use the existing versioned studio store and reject stale saves. Inactive suppliers remain available through the directory status filter.

Contact person, email, phone, HTTPS website, address and working notes are optional. Company name and services are required. Unknown information should be left blank. Supplier contacts are stored in the private database, never in repository seed data or public website output.

The local products preview includes a fictional supplier. Run `node tests/products-preview.mjs` and open `studio=suppliers` to inspect it. Relevant tests: `tests/studio-suppliers.test.mjs`.
