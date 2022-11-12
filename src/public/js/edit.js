/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

window.addEventListener(`resize`, () =>
{
    fixDropdown();
});

/**
 * @name fixDropdown
 * @description Fixes the dropdown menu for mobile
 */
function fixDropdown()
{
    const dropdown = document.querySelector(`#navbar-list-4`);
    const navbarBrand = document.querySelector(`#navbar-brand`);
    const nav = document.querySelector(`nav`);
    if (window.innerWidth <= 600)
    {
        dropdown.classList.remove(`dropstart`);
        dropdown.classList.add(`dropdown`);
        dropdown.style = `flex-grow: 0`;
        navbarBrand.style.display = `none`;
        nav.classList.add(`justify-content-center`);
        nav.classList.remove(`justify-content-between`);
    }
    else
    {
        dropdown.classList.add(`dropstart`);
        dropdown.classList.remove(`dropdown`);
        dropdown.style = `flex-grow:0; margin-right: 15px;`;
        navbarBrand.style.display = `flex`;
        nav.classList.remove(`justify-content-center`);
        nav.classList.add(`justify-content-between`);
    }
}

fixDropdown();

/**
 * @name darkMode
 * @description Adds the dark mode class to the dropdown menu
 * @param {string} dark if user is using dark
 */
function darkMode(dark)
{
    if (dark === `dark`)
        document.querySelector(`.dropdown-menu`).classList.add(`dropdown-menu-dark`);

    else
        document.querySelector(`.dropdown-menu`).classList.remove(`dropdown-menu-dark`);
}

window.matchMedia(`(prefers-color-scheme: dark)`).addEventListener(`change`, (event) =>
{
    const colorScheme = event.matches ? `dark` : `light`;
    darkMode(colorScheme);
});

darkMode(window.matchMedia(`(prefers-color-scheme: dark)`).matches ? `dark` : `light`);

const linksArray = links.split(`,`);
const linksNamesArray = linksNames.split(`,`);
const linksDiv = document.querySelector(`.links`);

for (const link of linksArray)
{
    const index = linksArray.indexOf(link);
    addLink(index, link, linksNamesArray[index]);
}

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

switch (verified)
{
    case VER_STATUS.STAFF_MEMBER: {
        document.querySelector(`#verified`).innerHTML += `Staff Member`;
        document.querySelector(`#paymentThings`).style.display = `none`;

        const hr = document.createElement(`hr`);
        hr.classList.add(`dropdown-divider`);
        document.querySelector(`#profileDropdown`).prepend(hr);
        const staffPortal = document.createElement(`a`);
        staffPortal.classList.add(`dropdown-item`);
        staffPortal.href = `/staff`;
        staffPortal.innerHTML = `Staff Portal`;
        document.querySelector(`#profileDropdown`).prepend(staffPortal);

        break;
    }
    case VER_STATUS.VERIFIED_MEMBER: {
        document.querySelector(`#verified`).innerHTML += `Verified`;
        break;
    }
    case VER_STATUS.AWAITING_VERIFICATION: {
        document.querySelector(`#bugUserToVerify`).style.display = `block`;
        document.querySelector(`#paymentThings`).style.display = `none`;
        document.querySelector(`#viewMyProfileButton`).classList.add(`disabled`);

        break;
    }
    default: {
        document.querySelector(`#verified`).style.display = `none`;
        break;
    }
}

/**
 * @name addLink
 * @description Adds a link to the list
 * @param {number} index The index of the link
 * @param {string} link The link
 * @param {string} linkName The name of the link
 */
function addLink(index, link, linkName)
{
    if (index >= 50)
        return; // only can add 50 links

    const linkDiv = document.createElement(`div`);
    if (index === 0)
    {
        const hrForMobile = document.createElement(`hr`);
        hrForMobile.id = `hrForMobile`;
        linkDiv.append(hrForMobile);
    }
    linkDiv.innerHTML += linkName !== `` ? `<input type="text" id="linkName${ index }" name="linkName${ index }" value="${ linksNamesArray[index] }" placeholder="Link Name" required>` : `<input type="text" id="linkName${ index }" name="linkName${ index }" placeholder="Link Name" required>`;

    const brForLinkName = document.createElement(`br`);
    brForLinkName.id = `pageBreakForButtons`;
    brForLinkName.style = `line-height: 5px;`;
    linkDiv.append(brForLinkName);
    linkDiv.innerHTML += `<input type="text" id="link${ index }" name="link${ index }" value="${ link }" placeholder="Link" required>`;

    const brForButtons = document.createElement(`br`);
    brForButtons.id = `pageBreakForButtons`;
    brForButtons.style = `line-height: 5px;`;
    linkDiv.append(brForButtons);

    const deleteButton = document.createElement(`button`);
    deleteButton.classList.add(`btn`, `btn-danger`);
    deleteButton.style.marginLeft = `10px`;
    deleteButton.innerHTML = `Delete`;
    deleteButton.addEventListener(`click`, () =>
    {
        linkDiv.remove();
    });

    linkDiv.append(deleteButton);

    const moveUpButton = document.createElement(`button`);
    moveUpButton.classList.add(`btn`, `btn-primary`);
    moveUpButton.type = `button`;
    moveUpButton.style.marginLeft = `10px`;
    moveUpButton.innerHTML = `Move Up`;
    moveUpButton.addEventListener(`click`, () =>
    {
        moveUp(index);
    });
    linkDiv.append(moveUpButton);

    const moveDownButton = document.createElement(`button`);
    moveDownButton.classList.add(`btn`, `btn-primary`);
    moveDownButton.type = `button`;
    moveDownButton.style.marginLeft = `10px`;
    moveDownButton.innerHTML = `Move Down`;
    moveDownButton.addEventListener(`click`, () =>
    {
        moveDown(index);
    });
    linkDiv.append(moveDownButton);

    const hrForMobile = document.createElement(`hr`);
    hrForMobile.id = `hrForMobile`;
    linkDiv.append(hrForMobile);

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
    await $.ajax(`${ protocol }//${ domain }/delete`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            password,
        }),
    });
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
    if ((newEmail === oldEmailGuess) || (newEmail.length > 512))
        return;

    const regexEmail = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/gm;
    if (!regexEmail.test(newEmail))
        return;

    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/edit/changeEmail`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            oldEmail: oldEmailGuess,
            newEmail,
            password,
        }),
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

    await $.ajax(`${ protocol }//${ domain }/edit/changePassword`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            oldPassword: oldPasswordGuess,
            newPassword,
        }),
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
    await $.ajax(`${ protocol }//${ domain }/edit/changeUsername`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
            password,
        }),
    });
    window.location.reload();
}

/**
 * @name updateCSS
 * @description Update Advanced Theme CSS
 */
function updateCSS()
{
    const backgroundColor = document.querySelector(`#backgroundColor`).value;
    const textColor = document.querySelector(`#textColor`).value;
    const borderColor = document.querySelector(`#borderColor`).value;
    const finalCSS = document.querySelector(`#finalCSS`);
    finalCSS.value = `<style>
    :root {
    --background-color: ${ backgroundColor };
    --text-color: ${ textColor };
    --border-color: ${ borderColor };
}

    html,
    body,
    main,
    div.links>div>button {
        background-color: var(--background-color);
    }

    p,
    a {
        color: var(--text-color);
    }

    div.links>div>button {
        border: solid var(--border-color) 2px;
        color: var(--text-color);
    }
    </style>`;
}

/**
 * @name showHideColorPickers
 * @description Shows or hides the color pickers if the user wants to use the Custom theme
 */
function showHideColorPickers()
{
    if (document.querySelector(`#themeOptions`).value === `Custom`)
        document.querySelector(`#advancedThemes`).style.display = `block`;
    else
        document.querySelector(`#advancedThemes`).style.display = `none`;
}

document.querySelector(`#backgroundColor`).addEventListener(`change`, updateCSS);
document.querySelector(`#textColor`).addEventListener(`change`, updateCSS);
document.querySelector(`#borderColor`).addEventListener(`change`, updateCSS);
document.querySelector(`#themeOptions`).addEventListener(`change`, showHideColorPickers);

updateCSS();
showHideColorPickers();
