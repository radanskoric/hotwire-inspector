# Website development

The single-page Jekyll site lives in [website/](./) and builds independently
of the extension. On the host, install Ruby 4.0.2 (see
[.ruby-version](.ruby-version)) using your usual version manager,
and Bundler. Native gem compilation may require a compiler and platform build
headers (Xcode Command Line Tools on macOS; build-essential on Debian).

Run these commands from the repository root:

```sh
cd website
bundle install
bundle exec jekyll serve --host 0.0.0.0 --port 4000
```

Open <http://localhost:4000>. Restart Jekyll after changing `_config.yml`.
For container development, rebuild the devcontainer, then run the same commands
inside it. Ruby and Bundler are provisioned by its Ruby feature; port 4000 is
forwarded alongside the extension's port 4173. Run `bundle install` in `website/`
after container creation. Keep host and container gem installations separate;
`bundle config set --local path vendor/bundle` is an optional local setup, and
its configuration and gems are ignored.

Production build:

Run these commands from the repository root:

```sh
cd website
JEKYLL_ENV=production bundle exec jekyll build --trace
```

Output is `website/_site/`, ignored by Git and the repository lint/format checks.
The site uses root-relative local assets and production metadata for
<https://inspector.masterhotwire.com>.

### Website publication

The [website workflow](../.github/workflows/website.yml) builds pull requests with
read-only permissions and deploys successful builds from `main` using GitHub
Pages. Manual runs on other branches only build. No extension release is needed.
