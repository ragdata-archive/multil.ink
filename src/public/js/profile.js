/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

if (ageGated === `1`)
{
    document.querySelector(`#main`).style.display = `none`;
    document.querySelector(`#ageGate`).style.display = `block`;
}

paid = (paid === `true`);
if (!paid)
    document.querySelector(`.ad`).style.display = `block`;

if (verified === VER_STATUS.STAFF_MEMBER)
    document.querySelector(`#verifiedBadgeStaff`).style.display = `block`;
else if (verified === VER_STATUS.VERIFIED_MEMBER)
    document.querySelector(`#verifiedBadge`).style.display = `block`;

let linksArray = links.split(`,`);
let linksNamesArray = JSON.parse(linksNames);
if (!paid)
{
    linksArray = linksArray.slice(0, 7);
    linksNamesArray = linksNamesArray.slice(0, 7);
}

const linksDiv = document.querySelector(`.links`);
const faBrandsList = [
    `<i class="fa-brands fa-instagram"></i> `,
    `<i class="fa-brands fa-instagram"></i> `,
    `<i class="fa-brands fa-twitter"></i> `,
    `<i class="fa-brands fa-youtube"></i> `,
    `<i class="fa-brands fa-twitch"></i> `,
    `<i class="fa-brands fa-discord"></i> `,
    `<i class="fa-brands fa-snapchat"></i> `,
    `<i class="fa-brands fa-reddit"></i> `,
    `<i class="fa-brands fa-pinterest"></i> `,
    `<i class="fa-brands fa-facebook"></i> `,
    `<i class="fa-brands fa-linkedin"></i> `,
    `<i class="fa-brands fa-github"></i> `,
    `<i class="fa-brands fa-steam"></i> `,
    `<i class="fa-brands fa-tiktok"></i> `
];
const faBrandDomainList = [
    `instagram.com`,
    `instagr.am`,
    `twitter.com`,
    `youtube.com`,
    `twitch.tv`,
    `discord.com`,
    `snapchat.com`,
    `reddit.com`,
    `pinterest.com`,
    `facebook.com`,
    `linkedin.com`,
    `github.com`,
    `steamcommunity.com`,
    `tiktok.com`
];
for (const link of linksArray)
{
    const index = linksArray.indexOf(link);
    const linkDiv = document.createElement(`div`);
    let iconTemplate = ``;
    if (faBrandDomainList.some((v) => link.includes(v)))
    {
        const faBrandIndex = faBrandDomainList.findIndex((v) => link.includes(v));
        iconTemplate = faBrandsList[faBrandIndex];
    }
    linkDiv.innerHTML = `<button type="button" onclick="window.open('${ link }', '_blank');">${ iconTemplate }${ linksNamesArray[index] }</button>`;
    if (link !== ``)
        linksDiv.append(linkDiv);
}
