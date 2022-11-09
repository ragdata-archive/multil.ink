<div align="center">
<h1>linktree-clone-idea<br>
<a href="https://github.com/chxseh/linktree-clone-idea/actions/workflows/linter.yml"><img alt="GitHub Actions Status" src="https://github.com/chxseh/linktree-clone-idea/actions/workflows/linter.yml/badge.svg"></a>
<a href="https://github.com/chxseh/linktree-clone-idea/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/chxseh/linktree-clone-idea"></a>
<a href="https://github.com/chxseh/linktree-clone-idea/issues"><img alt="Issues" src="https://img.shields.io/github/issues/chxseh/linktree-clone-idea"></a>
<a href="https://github.com/chxseh/linktree-clone-idea/pulls"><img alt="Pull Requests" src="https://img.shields.io/github/issues-pr/chxseh/linktree-clone-idea"></a>
<a href="https://github.com/chxseh/linktree-clone-idea/network"><img alt="Forks" src="https://img.shields.io/github/forks/chxseh/linktree-clone-idea"></a>
<a href="https://github.com/chxseh/linktree-clone-idea/blob/main/LICENSE.md"><img alt="License" src="https://img.shields.io/github/license/chxseh/linktree-clone-idea"></a>
</h1></div>

## Installation

#### Requirements  
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) >= v16.14.0
- [pm2](https://www.npmjs.com/package/pm2) (`npm i -g pm2`)

#### Installation

```bash
git clone https://github.com/chxseh/linktree-clone-idea.git
cd linktree-clone-idea
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
