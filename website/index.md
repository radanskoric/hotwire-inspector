---
layout: home
permalink: /
hero:
  name: Hotwire Inspector
  image:
    src: /assets/images/hi-tree-view-on-campfire.png
    alt: Hotwire Inspector showing Turbo Frames and Stimulus controllers in a tree view
  tagline: >-
    A browser extension for inspecting Hotwire applications.
    <span class="hero-subtitle">Built by the author of <a href="https://masterhotwire.com/" class="book-link">Master Hotwire <img src="/assets/images/master-hotwire.ico" width="16" height="16" alt=""></a> book.</span>
  actions:
    - theme: brand
      text: Install for Chrome
      link: https://chromewebstore.google.com/detail/hotwire-inspector/ffdcpmhnmbkfhknjmcjbcamnngmcbcmj
    - theme: alt
      text: Install for Firefox
      link: https://addons.mozilla.org/en-US/firefox/addon/hotwire-inspector/
features:
  - title: Hotwire page tree structure
    details: Scans the page DOM and highlights all Hotwire related elements, displayed in an easy to navigate tree structure..
  - title: Stimulus controller details
    details: Detects Stimulus metadata, gives you an easy overview of values, targets and outlets and observes live value changes.
  - title: Turbo event timeline
    details: Captures Turbo events and displays them in a timeline with details for easy inspecting.
---

<section class="feature-showcase" aria-label="Explore the features">
  <article class="feature-row">
    <div class="feature-copy"><h2>See how your page fits together</h2><p>Explore nested Turbo Frames, Stimulus controllers, and their targets in one tree. Find the element you need without digging through the full page DOM.</p></div>
    <div class="feature-image">
      <img class="feature-light" src="/assets/images/features/tree-light.png" alt="Nested ToDo frames with Stimulus controllers and targets" loading="lazy">
      <img class="feature-dark" src="/assets/images/features/tree-dark.png" alt="Nested ToDo frames with Stimulus controllers and targets" loading="lazy">
    </div>
  </article>
  <article class="feature-row">
    <div class="feature-copy"><h2>Focus on the controllers that matter</h2><p>Use the searchable controller selector to narrow the tree while keeping the surrounding frame structure in view.</p></div>
    <div class="feature-image">
      <img class="feature-light" src="/assets/images/features/filter-light.png" alt="Open controller selector filtering the ToDo tree" loading="lazy">
      <img class="feature-dark" src="/assets/images/features/filter-dark.png" alt="Open controller selector filtering the ToDo tree" loading="lazy">
    </div>
  </article>
  <article class="feature-row">
    <div class="feature-copy"><h2>Look inside a Stimulus controller</h2><p>Check typed values, find target elements, and follow outlet connections from the controller details panel. Stimulus values live update as they change on the page.</p></div>
    <div class="feature-image">
      <img class="feature-light" src="/assets/images/features/controller-light.png" alt="ToDo list controller values, clear target, and counter outlet" loading="lazy">
      <img class="feature-dark" src="/assets/images/features/controller-dark.png" alt="ToDo list controller values, clear target, and counter outlet" loading="lazy">
    </div>
  </article>
  <article class="feature-row">
    <div class="feature-copy"><h2>Follow a Turbo update</h2><p>See Turbo events in order, identify their target frame, and inspect captured details to understand what happened. Turbo events are filterable, just like the tree view.</p></div>
    <div class="feature-image">
      <img class="feature-light" src="/assets/images/features/events-light.png" alt="Turbo frame update events with captured HTML details" loading="lazy">
      <img class="feature-dark" src="/assets/images/features/events-dark.png" alt="Turbo frame update events with captured HTML details" loading="lazy">
    </div>
  </article>
</section>

## Why Hotwire Inspector?

Hotwire Inspector exists to make it easier to understand the structure of Hotwire-powered pages, especially Turbo Frames and Stimulus controllers, directly from the browser's DevTools.

There are existing tools, but I wanted a cross-browser extension that integrates into DevTools rather than opening a separate window.

## Hotwire Inspector works hard to not interfere with your application

The inspector aims to keep the page close to its normal runtime behavior:

- Element tracking uses existing IDs and weak references, without adding tracking attributes to the DOM. The tracking maps do not keep detached elements alive.
- Highlighting adds a temporary, fixed-position overlay rather than changing the inspected element's styles.
- Turbo events are observed through capture-phase listeners.
- Access to Stimulus controllers and their definitions happens on request. These queries create no page globals; the only globals created are those storing a controller in a `window.tempN` variable, at explicit user request.

Inspection still runs code in the page's environment. Looking up controllers and reading metadata can invoke page-owned methods or getters.

<div class="install-actions">
  {% for action in page.hero.actions %}
  <a class="VPButton medium {{ action.theme }} no-icon" href="{{ action.link }}" target="_blank" rel="noreferrer">{{ action.text }}</a>
  {% endfor %}
</div>

<footer class="site-footer">
  <p>Hotwire Inspector is built by <a href="https://radan.dev/">Radan Skorić</a>, author of <a href="https://masterhotwire.com/" class="book-link">Master Hotwire <img src="/assets/images/master-hotwire.ico" width="16" height="16" alt=""></a></p>
</footer>
