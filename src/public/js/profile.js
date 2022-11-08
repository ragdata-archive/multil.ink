/* eslint-disable no-undef */

document.querySelector(`#main`).style.display = `block`;
if (ageGated === `1`)
{
    document.querySelector(`#main`).style.display = `none`;
    document.querySelector(`#ageGate`).style.display = `block`;
}

paid = (paid === `true`);
if (!paid)
    document.querySelector(`.ad`).style.display = `block`;

if (verified === `2`)
    document.querySelector(`#verifiedBadgeStaff`).style.display = `block`;
else if (verified === `1`)
    document.querySelector(`#verifiedBadge`).style.display = `block`;

let linksArray = links.split(`,`);
let linksNamesArray = linksNames.split(`,`);
if (!paid)
{
    linksArray = linksArray.slice(0, 7);
    linksNamesArray = linksNamesArray.slice(0, 7);
}

const linksDiv = document.querySelector(`.links`);
for (const link of linksArray)
{
    const index = linksArray.indexOf(link);
    const linkDiv = document.createElement(`div`);
    linkDiv.innerHTML = `<button type="button" onclick="window.open('${ link }', '_blank');">${ linksNamesArray[index] }</button>`;
    if (link !== ``)
        linksDiv.append(linkDiv);
}