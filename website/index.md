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
    <span class="hero-subtitle">Built by the author of <a href="https://masterhotwire.com/">Master Hotwire</a> book.</span>
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
