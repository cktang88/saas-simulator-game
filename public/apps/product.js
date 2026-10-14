// Placeholder: replaced by the full implementation.
import { html, mount } from '../core/ui.js';

export default {
  id: 'product',
  title: 'Product',
  icon: '🛠️',
  group: 'Product',
  render(root) {
    mount(root, html`<div class="app-head"><div><h1>Product</h1><p>Coming soon.</p></div></div>`);
  },
};
