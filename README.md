<div align="center">
<h1><a href="https://multil.ink">multil.ink</a><br>
<a href="https://github.com/chxseh/multil.ink/actions/workflows/linter.yml"><img alt="GitHub Actions Status" src="https://github.com/chxseh/multil.ink/actions/workflows/linter.yml/badge.svg"></a>
<a href="https://github.com/chxseh/multil.ink/stargazers"><img alt="GitHub stars" src="https://badges.chse.dev:/github/stars/chxseh/multil.ink"></a>
<a href="https://github.com/chxseh/multil.ink/issues"><img alt="GitHub issues" src="https://badges.chse.dev:/github/issues/chxseh/multil.ink"></a>
<a href="https://github.com/chxseh/multil.ink/pulls"><img alt="GitHub Pull Requests" src="https://badges.chse.dev:/github/issues-pr/chxseh/multil.ink"></a>
<a href="https://github.com/chxseh/multil.ink/network"><img alt="GitHub forks" src="https://badges.chse.dev:/github/forks/chxseh/multil.ink"></a>
<a href="https://github.com/chxseh/multil.ink/blob/main/LICENSE.md"><img alt="GitHub license" src="https://badges.chse.dev:/github/license/chxseh/multil.ink"></a>
</h1></div>

## Installation

#### Requirements  
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) >= v16.14.0
- [pm2](https://www.npmjs.com/package/pm2) (`npm i -g pm2`)

#### Installation

```bash
git clone https://github.com/chxseh/multil.ink.git
cd multil.ink
npm ci
node .
```

## Documentation

### Adding Font Awesome Icons
1. Find the icon you want to use on [Font Awesome](https://fontawesome.com/v5/cheatsheet/free/brands).
2. Add the class in `./src/public/js/profile.js` to `faBrandsList`.
3. Add the domain you want it to match to in `./src/public/js/profile.js` to `faBrandDomainList`.

### Adding Fonts
1. Find the font you want to use on [google-webfonts-helper](https://google-webfonts-helper.herokuapp.com/).
2. Change the `Customize folder prefix` to `../webfonts/`.
3. Place the font files in `./src/public/webfonts/`.
4. Add the font CSS to `./src/public/css/font-*.css`.

### Changing Custom Theme CSS
1. Look in `./src/public/js/edit.js` for the `updateCSS` function.
