# Use WXT

After evaluating various solutions including just handcrafting Vanilla JS, [WXT](https://wxt.dev/) seems like the best balance of simplicity and cross browser compatibility.

WXT fits this project well because it:

- Works well with Vite and I'm already familiar with it.
- Supports all three target browsers: Chrome, Firefox, and Safari.
- The setup looks simple enough, matching Vite philosophy. Clean modern API design, avoiding unnecessary complexity.
- It simplifies the builds and cross browser support compared to doing it manually.

My expectation is that it will allow me to focus on the hot wire extension logic while keeping the rest simple. If that is ever turned out not to be true, I can migrate from it.
