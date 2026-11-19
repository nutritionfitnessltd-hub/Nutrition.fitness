import sanitizeHtml from 'sanitize-html';
import {cleanNewsletterCss} from './newsletter-css.mjs';
export function cleanNewsletterHtml(value) {
  const sanitized = sanitizeHtml(value, {
    allowedTags: ['html', 'head', 'body', 'title', 'style', 'center', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'div', 'span', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'],
    allowedAttributes: { '*': ['style', 'class', 'id', 'align', 'valign', 'bgcolor', 'width', 'height', 'role', 'aria-label'], html: ['lang'], a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'title', 'border'], table: ['cellpadding', 'cellspacing', 'border'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], style: ['type', 'media'] },
    allowedSchemes: ['https', 'mailto', 'tel'], allowedSchemesByTag: { img: ['https', 'data'] }, allowProtocolRelative: false,
    allowVulnerableTags: true, parseStyleAttributes: false,
    transformTags: {
      '*': (tagName, attributes) => {
        const attribs = {...attributes};
        if (attribs.style) attribs.style = cleanNewsletterCss(attribs.style, true);
        if (tagName === 'a') {
          attribs.href = /^(https:\/\/|mailto:|tel:|#)/i.test(attribs.href || '') ? attribs.href : '';
          attribs.rel = 'noopener noreferrer';
          if (attribs.target !== '_blank') delete attribs.target;
        }
        if (tagName === 'img' && !(/^(?:https:\/\/|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$)/i).test(attribs.src || '')) delete attribs.src;
        return {tagName, attribs};
      },
    },
  });
  // sanitize-html deliberately passes raw style text through without textFilter.
  // Parse every surviving style block after the HTML parser has normalised tags.
  return sanitized.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_match, opening, css, closing) => opening + cleanNewsletterCss(css) + closing);
}
