/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

document.querySelector(`#main`).style.display = `block`;
const linksArray = links.split(`,`);
const linksNamesArray = linksNames.split(`,`);
const linksDiv = document.querySelector(`.links`);

for (const link of linksArray)
{
    const index = linksArray.indexOf(link);
    addLink(index, link, linksNamesArray[index]);
}

// on click of add link button
document.querySelector(`#addLink`).addEventListener(`click`, (event) =>
{
    event.preventDefault();
    const linksDiv = document.querySelector(`.links`);
    const index = linksDiv.childElementCount;
    addLink(index, ``, ``);
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

    // add menu option to staff portal in #profileDropdown
    const hr = document.createElement(`hr`);
    hr.classList.add(`dropdown-divider`);
    document.querySelector(`#profileDropdown`).prepend(hr);
    const staffPortal = document.createElement(`a`);
    staffPortal.classList.add(`dropdown-item`);
    staffPortal.href = `/staff`;
    staffPortal.innerHTML = `Staff Portal`;
    document.querySelector(`#profileDropdown`).prepend(staffPortal);
}
else if (verified === `1`)
    document.querySelector(`#verified`).innerHTML += `Verified`;

else
    document.querySelector(`#verified`).style.display = `none`;

/**
 * @name addLink
 * @description Adds a link to the list
 * @param {number} index The index of the link
 * @param {string} link The link
 * @param {string} linkName The name of the link
 */
function addLink(index, link, linkName)
{
    const linkDiv = document.createElement(`div`);
    if (index >= 50)
        return; // only can add 50 links
    linkDiv.innerHTML = `<label for="link${ index }">Link ${ index + 1 }</label>`;
    linkDiv.innerHTML += `<input type="text" id="link${ index }" name="link${ index }" value="${ link }" required>`;
    linkDiv.innerHTML += `<label for="linkName${ index }">Link Name ${ index + 1 }</label>`;
    linkDiv.innerHTML += linkName !== `` ? `<input type="text" id="linkName${ index }" name="linkName${ index }" value="${ linksNamesArray[index] }" required>` : `<input type="text" id="linkName${ index }" name="linkName${ index }" required>`;
    // delete button
    const deleteButton = document.createElement(`button`);
    deleteButton.classList.add(`btn`, `btn-danger`);
    deleteButton.style.marginLeft = `10px`;
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
}

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

/**
 * @name logout
 * @description Logs the user out
 */
async function logout()
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/logout?_method=DELETE`, {
        type: `POST`,
    });
    window.location.reload();
}

/**
 * @name deleteAccount
 * @description Deletes the account
 * @param {string} password The password of the account
 */
async function deleteAccount(password)
{
    if (!password || password === ``)
        return;
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/delete?password=${ password }`, {
        type: `POST`,
    });
    // logout();
    window.location.reload();
}

/**
 * @name changeEmail
 * @description Changes the users email
 * @param {string} oldEmailGuess Old email the user entered
 * @param {string} newEmail New email the user entered
 * @param {string} password The users password
 */
async function changeEmail(oldEmailGuess, newEmail, password)
{
    if ((oldEmailGuess !== oldEmail) || (newEmail === oldEmail) || (newEmail.length > 1024))
        return;

    const regexEmail = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/gm;
    if (!regexEmail.test(newEmail))
        return;

    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/edit/changeEmail?oldEmail=${ oldEmailGuess }&newEmail=${ newEmail }&password=${ password }`, {
        type: `POST`,
    });
    window.location.reload();
}

/**
 * @name changePassword
 * @description Changes the users password
 * @param {string} oldPasswordGuess Old password the user entered
 * @param {string} newPassword New password the user entered
 * @param {string} newPasswordRepeat New password repeated
 */
async function changePassword(oldPasswordGuess, newPassword, newPasswordRepeat)
{
    if ((newPassword !== newPasswordRepeat) || newPassword.length < 0 || newPassword.length > 1024)
        return;

    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/edit/changePassword?oldPassword=${ oldPasswordGuess }&newPassword=${ newPassword }`, {
        type: `POST`,
    });
    logout();
}

/**
 * @name changeUsername
 * @description Changes the users username
 * @param {string} username The new username
 * @param {string} password The users password
 */
async function changeUsername(username, password)
{
    if (username.length > 60 || username.length === 0 || password.length === 0 || password.length > 1024)
        return;

    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/edit/changeUsername?username=${ username }&password=${ password }`, {
        type: `POST`,
    });
    window.location.reload();
}
