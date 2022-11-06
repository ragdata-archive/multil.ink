/* eslint-disable no-undef */

document.querySelector(`#main`).style.display = `block`;

paid = (paid === `true`);
if (!paid)
    document.querySelector(`.ad`).style.display = `block`;

if (verified === `2`)

    document.querySelector(`#verifiedBadgeStaff`).style.display = `block`;

else if (verified === `1`)

    document.querySelector(`#verifiedBadge`).style.display = `block`;

let linksArray = links.split(`,`);
if (!paid)

    linksArray = linksArray.slice(0, 7);

let linksNamesArray = linksNames.split(`,`);
if (!paid)

    linksNamesArray = linksNamesArray.slice(0, 7);

const linksDiv = document.querySelector(`.links`);
for (const link of linksArray)
{
    const index = linksArray.indexOf(link);
    const linkDiv = document.createElement(`div`);
    linkDiv.innerHTML = `<a href="${ link }">${ linksNamesArray[index] }</a>`;
    if (link !== ``)
        linksDiv.append(linkDiv);
}
