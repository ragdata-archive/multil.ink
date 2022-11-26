<div align="center">
<h1><a href="https://multil.ink">multil.ink</a><br>
<a href="https://github.com/multilinkhq/multil.ink/actions/workflows/linter.yml"><img alt="GitHub Actions Status" src="https://github.com/multilinkhq/multil.ink/actions/workflows/linter.yml/badge.svg"></a>
<a href="https://github.com/multilinkhq/multil.ink/stargazers"><img alt="GitHub stars" src="https://badges.chse.dev:/github/stars/multilinkhq/multil.ink"></a>
<a href="https://github.com/multilinkhq/multil.ink/issues"><img alt="GitHub issues" src="https://badges.chse.dev:/github/issues/multilinkhq/multil.ink"></a>
<a href="https://github.com/multilinkhq/multil.ink/pulls"><img alt="GitHub Pull Requests" src="https://badges.chse.dev:/github/issues-pr/multilinkhq/multil.ink"></a>
<a href="https://github.com/multilinkhq/multil.ink/network"><img alt="GitHub forks" src="https://badges.chse.dev:/github/forks/multilinkhq/multil.ink"></a>
<a href="https://github.com/multilinkhq/multil.ink/blob/main/LICENSE.md"><img alt="GitHub license" src="https://badges.chse.dev:/github/license/multilinkhq/multil.ink"></a>
</h1></div>

## Installation

#### Requirements
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) >= v16.14.0
- [pm2](https://www.npmjs.com/package/pm2) (`npm i -g pm2`)

#### Installation

```bash
git clone https://github.com/multilinkhq/multil.ink.git
cd multil.ink
npm ci
node . # or: pm2 start npm --name "multilink" -- start
```

## Documentation

### Mapping Font Awesome Icons to URLs
1. Find the icon you want to use on [Font Awesome](https://fontawesome.com/v5/cheatsheet/free/brands).
2. Add the class in `./src/public/js/profile.js` to `faBrandsList`.
3. Add the domain you want it to match to in `./src/public/js/profile.js` to `faBrandDomainList`.

### Adding Fonts
1. Find the font you want to use on [google-webfonts-helper](https://google-webfonts-helper.herokuapp.com/).
2. Change the `Customize folder prefix` to `../webfonts/`.
3. Place the font files in `./src/public/webfonts/`.
4. Add the font CSS to `./src/public/css/font-*.css`.

### Changing Custom Theme CSS
1. Look in `./src/app.js` -> `app.post('/edit')` -> `advancedTheme`.

### Adding Default Themes
1. Using `theme-dark.css` as a base, create a new CSS file in `./src/public/css/` with the name `theme-yourname.css` (all lowercase).

Note: The theme name will have it's first letter capitalized and the rest of the name will be lowercased. (For example, if your theme file is called `theme-bloodmoon.css`, the theme name will be `Bloodmoon`.)

### Adding new Featured Content Embeds
1. Add URL to `./src/app.js` -> `supportedFeaturedContentUrls`.
2. Add embed code to `./src/public/js/profile.js` -> `featuredContentEmbeds`.
