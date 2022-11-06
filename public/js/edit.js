/* eslint-disable no-undef */

document.querySelector(`#main`).style.display = `block`;
const linksArray = links.split(`,`);
const linksNamesArray = linksNames.split(`,`);
const linksDiv = document.querySelector(`.links`);

for (const link of linksArray)
{
    const index = linksArray.indexOf(link);
    const linkDiv = document.createElement(`div`);
    linkDiv.innerHTML = `<label for="link${ index }">Link ${ index + 1 }</label>`;
    linkDiv.innerHTML += `<input type="text" id="link${ index }" name="link${ index }" value="${ link }" required>`;
    linkDiv.innerHTML += `<label for="linkName${ index }">Link Name ${ index + 1 }</label>`;
    linkDiv.innerHTML += `<input type="text" id="linkName${ index }" name="linkName${ index }" value="${ linksNamesArray[index] }" required>`;
    // delete button
    const deleteButton = document.createElement(`button`);
    deleteButton.classList.add(`btn`, `btn-danger`);
    deleteButton.style.marginLeft = `10px`;
    deleteButton.innerHTML = `Delete`;
    deleteButton.addEventListener(`click`, () =>
    {
        linkDiv.remove();
    });
    // if (index > 0)
    linkDiv.append(deleteButton);

    // move up/down buttons
    const moveUpButton = document.createElement(`button`);
    moveUpButton.classList.add(`btn`, `btn-primary`);
    moveUpButton.style.marginLeft = `10px`;
    moveUpButton.innerHTML = `Move Up`;
    moveUpButton.addEventListener(`click`, () =>
    {
        moveUp(index);
    });
    linkDiv.append(moveUpButton);

    const moveDownButton = document.createElement(`button`);
    moveDownButton.classList.add(`btn`, `btn-primary`);
    moveDownButton.style.marginLeft = `10px`;
    moveDownButton.innerHTML = `Move Down`;
    moveDownButton.addEventListener(`click`, () =>
    {
        moveDown(index);
    });
    linkDiv.append(moveDownButton);

    linksDiv.append(linkDiv);
}

// on click of add link button
document.querySelector(`#addLink`).addEventListener(`click`, (event) =>
{
    event.preventDefault();
    const linksDiv = document.querySelector(`.links`);
    const linkDiv = document.createElement(`div`);
    const index = linksDiv.childElementCount;
    if (index >= 50)
        return; // only can add 50 links

    linkDiv.innerHTML = `<label for="link${ index }">Link ${ index + 1 }</label>`;
    linkDiv.innerHTML += `<input type="text" id="link${ index }" name="link${ index }" required>`;
    linkDiv.innerHTML += `<label for="linkName${ index }">Link Name ${ index + 1 }</label>`;
    linkDiv.innerHTML += `<input type="text" id="linkName${ index }" name="linkName${ index }" required>`;
    // delete button
    const deleteButton = document.createElement(`button`);
    deleteButton.classList.add(`btn`, `btn-danger`);
    deleteButton.innerHTML = `Delete`;
    deleteButton.addEventListener(`click`, () =>
    {
        linkDiv.remove();
    });
    linkDiv.append(deleteButton);

    // move up/down buttons
    const moveUpButton = document.createElement(`button`);
    moveUpButton.classList.add(`btn`, `btn-primary`);
    moveUpButton.style.marginLeft = `10px`;
    moveUpButton.innerHTML = `Move Up`;
    moveUpButton.addEventListener(`click`, () =>
    {
        moveUp(index);
    });
    linkDiv.append(moveUpButton);

    const moveDownButton = document.createElement(`button`);
    moveDownButton.classList.add(`btn`, `btn-primary`);
    moveDownButton.style.marginLeft = `10px`;
    moveDownButton.innerHTML = `Move Down`;
    moveDownButton.addEventListener(`click`, () =>
    {
        moveDown(index);
    });
    linkDiv.append(moveDownButton);

    linksDiv.append(linkDiv);
});

paid = (paid === `true`);
if (paid)
{
    document.querySelector(`#planText`).innerHTML += `Paid`;
    document.querySelector(`#paid`).style.display = `block`;
}
else
{
    document.querySelector(`#planText`).innerHTML += `Free`;
    document.querySelector(`#free`).style.display = `block`;
}

if (verified === `2`)
{
    document.querySelector(`#verified`).innerHTML += `Staff Member`;
    document.querySelector(`#paymentThings`).style.display = `none`;
}
else if (verified === `1`)
    document.querySelector(`#verified`).innerHTML += `Verified`;

else
    document.querySelector(`#verified`).style.display = `none`;

/**
 * @name moveUp
 * @description Moves the link up in the list
 * @param {number} index The index of the link
 */
function moveUp(index)
{
    if (index === 0)
        return;

    const oldLink = document.querySelector(`#link${ index }`);
    const oldLinkName = document.querySelector(`#linkName${ index }`);
    const newLink = document.querySelector(`#link${ index - 1 }`);
    const newLinkName = document.querySelector(`#linkName${ index - 1 }`);
    const temporaryLink = oldLink.value;
    const temporaryLinkName = oldLinkName.value;
    oldLink.value = newLink.value;
    oldLinkName.value = newLinkName.value;
    newLink.value = temporaryLink;
    newLinkName.value = temporaryLinkName;
}

/**
 * @name moveDown
 * @description Moves the link down in the list
 * @param {number} index The index of the link
 */
function moveDown(index)
{
    const linksDiv = document.querySelector(`.links`);
    if (index === linksDiv.childElementCount - 1)

        return;

    const oldLink = document.querySelector(`#link${ index }`);
    const oldLinkName = document.querySelector(`#linkName${ index }`);
    const newLink = document.querySelector(`#link${ index + 1 }`);
    const newLinkName = document.querySelector(`#linkName${ index + 1 }`);
    const temporaryLink = oldLink.value;
    const temporaryLinkName = oldLinkName.value;
    oldLink.value = newLink.value;
    oldLinkName.value = newLinkName.value;
    newLink.value = temporaryLink;
    newLinkName.value = temporaryLinkName;
}
