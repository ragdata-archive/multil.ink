/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

document.body.classList.add(`bg-dark`);
document.documentElement.classList.add(`bg-dark`);

const users = [];
for (let index = 0; index < numberOfUsers; index++)
{
    let linkData = links.split(`,`)[index];
    linkData = decodeURIComponent(atob(linkData));
    linkData = JSON.stringify(linkData);
    linkData = linkData.replaceAll(`\\`, ``);
    linkData = linkData.replaceAll(`""`, `"`);
    linkData = linkData.slice(1, -1);
    let linkNamesData = linkNames.split(`,`)[index];
    linkNamesData = decodeURIComponent(atob(linkNamesData));
    linkNamesData = JSON.stringify(linkNamesData);
    linkNamesData = linkNamesData.replaceAll(`\\`, ``);
    linkNamesData = linkNamesData.replaceAll(`""`, `"`);
    linkNamesData = linkNamesData.slice(1, -1);
    let ageGated = ageGatedUsers.split(`,`)[index];
    ageGated = ageGated === `1` ? `checked` : ``;
    users.push({
        username: usernames.split(`,`)[index],
        email: emails.split(`,`)[index],
        verified: Number.parseInt(verified.split(`,`)[index], 10),
        paid: paid.split(`,`)[index],
        subExpires: subExpires.split(`,`)[index],
        displayName: displayNames.split(`,`)[index],
        bio: bios.split(`,`)[index],
        image: images.split(`,`)[index],
        links: linkData,
        linkNames: linkNamesData,
        ageGated,
    });

    const table = document.querySelector(`#usersBody`);
    const row = table.insertRow();
    const username = row.insertCell(0);
    const email = row.insertCell(1);
    const verifiedCell = row.insertCell(2);
    const paidCell = row.insertCell(3);
    const subExpiresCell = row.insertCell(4);
    username.innerHTML = users[index].username;
    email.innerHTML = users[index].email;
    email.classList.add(`email`);

    if (users[index].verified === VER_STATUS.VERIFIED_MEMBER)
        verifiedCell.innerHTML = `Yes`;
    else if (users[index].verified === VER_STATUS.STAFF_MEMBER)
        verifiedCell.innerHTML = `Staff Member`;
    else if (users[index].verified === VER_STATUS.MEMBER)
        verifiedCell.innerHTML = `No`;
    else if (users[index].verified === VER_STATUS.SUSPENDED)
        verifiedCell.innerHTML = `Suspended`;
    else if (users[index].verified === VER_STATUS.SHADOW_USER)
        verifiedCell.innerHTML = `Shadow Profile`;
    else if (users[index].verified === VER_STATUS.AWAITING_VERIFICATION)
        verifiedCell.innerHTML = `Awaiting Email Verification`;

    if (users[index].paid === `1`)
        paidCell.innerHTML = `Yes`;
    else if (users[index].paid === `0` && users[index].verified !== VER_STATUS.SHADOW_USER)
        paidCell.innerHTML = `No`;

    if (users[index].verified !== VER_STATUS.SHADOW_USER)
        subExpiresCell.innerHTML = users[index].subExpires;

    username.setAttribute(`scope`, `row`);

    const actions = row.insertCell(5);

    const editButton = document.createElement(`button`);
    editButton.setAttribute(`class`, `btn btn-secondary`);
    editButton.setAttribute(`type`, `button`);
    editButton.setAttribute(`data-bs-toggle`, `modal`);
    editButton.setAttribute(`data-bs-target`, `#editModal`);
    editButton.setAttribute(`data-username`, `${ users[index].username }`);
    editButton.setAttribute(`data-index`, `${ index }`);
    editButton.innerHTML = `Edit`;
    if (users[index].username === myUsername)
    {
        editButton.removeAttribute(`data-bs-toggle`);
        editButton.setAttribute(`onclick`, `window.location.href = '../edit'`);
    }
    if (users[index].verified === VER_STATUS.SHADOW_USER)
        editButton.setAttribute(`data-bs-target`, `#editShadowModal`);

    actions.append(editButton);

    if (users[index].verified === VER_STATUS.MEMBER || users[index].verified === VER_STATUS.AWAITING_VERIFICATION)
    {
        const verifyButton = document.createElement(`button`);
        verifyButton.setAttribute(`class`, `btn btn-primary`);
        verifyButton.setAttribute(`type`, `button`);
        verifyButton.setAttribute(`onclick`, `verifyUser('${ users[index].username }')`);
        verifyButton.innerHTML = `Verify`;
        if (users[index].username === myUsername)
            verifyButton.setAttribute(`disabled`, `true`);

        actions.append(verifyButton);
    }
    else if (users[index].verified === VER_STATUS.VERIFIED_MEMBER)
    {
        const unverifyButton = document.createElement(`button`);
        unverifyButton.setAttribute(`class`, `btn btn-secondary`);
        unverifyButton.setAttribute(`type`, `button`);
        unverifyButton.setAttribute(`onclick`, `unverifyUser('${ users[index].username }')`);
        unverifyButton.innerHTML = `Unverify`;
        if (users[index].username === myUsername)
            unverifyButton.setAttribute(`disabled`, `true`);

        actions.append(unverifyButton);

        const promoteButton = document.createElement(`button`);
        promoteButton.setAttribute(`class`, `btn btn-primary`);
        promoteButton.setAttribute(`type`, `button`);
        promoteButton.setAttribute(`onclick`, `promoteUser('${ users[index].username }')`);
        promoteButton.innerHTML = `Promote`;
        if (users[index].username === myUsername)
            promoteButton.setAttribute(`disabled`, `true`);

        actions.append(promoteButton);
    }
    else if (users[index].verified === VER_STATUS.STAFF_MEMBER)
    {
        const demoteButton = document.createElement(`button`);
        demoteButton.setAttribute(`class`, `btn btn-warning`);
        demoteButton.setAttribute(`type`, `button`);
        demoteButton.setAttribute(`onclick`, `demoteUser('${ users[index].username }')`);
        demoteButton.innerHTML = `Demote`;
        if (users[index].username === myUsername)
            demoteButton.setAttribute(`disabled`, `true`);

        actions.append(demoteButton);
    }
    else if (users[index].verified === VER_STATUS.SUSPENDED)
    {
        const unsuspendButton = document.createElement(`button`);
        unsuspendButton.setAttribute(`class`, `btn btn-success`);
        unsuspendButton.setAttribute(`type`, `button`);
        unsuspendButton.setAttribute(`onclick`, `unsuspendUser('${ users[index].username }')`);
        unsuspendButton.innerHTML = `Unsuspend`;
        if (users[index].username === myUsername)
            unsuspendButton.setAttribute(`disabled`, `true`);

        actions.append(unsuspendButton);
    }

    if (users[index].verified !== VER_STATUS.SUSPENDED && users[index].verified !== VER_STATUS.STAFF_MEMBER
        && users[index].verified !== VER_STATUS.SHADOW_USER && users[index].verified !== VER_STATUS.AWAITING_VERIFICATION)
    {
        const suspendButton = document.createElement(`button`);
        suspendButton.setAttribute(`class`, `btn btn-danger`);
        suspendButton.setAttribute(`type`, `button`);
        suspendButton.setAttribute(`onclick`, `suspendUser('${ users[index].username }')`);
        suspendButton.innerHTML = `Suspend`;
        if (users[index].username === myUsername)
            suspendButton.setAttribute(`disabled`, `true`);

        actions.append(suspendButton);
    }

    if (users[index].verified === VER_STATUS.SUSPENDED || users[index].verified === VER_STATUS.SHADOW_USER
        || users[index].verified === VER_STATUS.AWAITING_VERIFICATION)
    {
        const deleteButton = document.createElement(`button`);
        deleteButton.setAttribute(`class`, `btn btn-danger`);
        deleteButton.setAttribute(`type`, `button`);
        deleteButton.setAttribute(`onclick`, `deleteUser('${ users[index].username }')`);
        deleteButton.innerHTML = `Delete`;
        if (users[index].username === myUsername)
            deleteButton.setAttribute(`disabled`, `true`);

        actions.append(deleteButton);
    }

    if (users[index].verified !== VER_STATUS.STAFF_MEMBER && users[index].verified !== VER_STATUS.SUSPENDED
        && users[index].verified !== VER_STATUS.SHADOW_USER && users[index].verified !== VER_STATUS.AWAITING_VERIFICATION)
    {
        let extendClass = `btn btn-primary dropdown-toggle`;
        if (users[index].username === myUsername || users[index].subExpires.startsWith(`9999`))
            extendClass += ` hidden`;

        const extendButton = `
                <button class="${ extendClass }" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    Extend Subscription
                </button>
                <div class="dropdown-menu dropdown-menu-dark" aria-labelledby="dropdownMenuButton">
                    <a class="dropdown-item" href="#" onclick="extendUser('${ users[index].username }', 1)">1 Month</a>
                    <a class="dropdown-item" href="#" onclick="extendUser('${ users[index].username }', 3)">3 Months</a>
                    <a class="dropdown-item" href="#" onclick="extendUser('${ users[index].username }', 6)">6 Months</a>
                    <div class="dropdown-divider"></div>
                    <a class="dropdown-item" href="#" onclick="extendUser('${ users[index].username }', 12)">1 Year</a>
                    <a class="dropdown-item" href="#" onclick="extendUser('${ users[index].username }', 24)">2 Years</a>
                    <a class="dropdown-item" href="#" onclick="extendUser('${ users[index].username }', 36)">3 Years</a>
                    <div class="dropdown-divider"></div>
                    <a class="dropdown-item" href="#" onclick="extendUser('${ users[index].username }', -1)">Forever</a>
                </div>
               `;
        actions.innerHTML += extendButton;
    }
}

const tableNavigation = document.querySelectorAll(`.tableNav`);
for (const [index, element] of tableNavigation.entries())
{
    if (index === 0)
    {
        const hr = document.createElement(`hr`);
        element.append(hr);
        const searchForm = document.createElement(`form`);
        searchForm.setAttribute(`class`, `d-flex`);
        searchForm.setAttribute(`onsubmit`, `return false;`);
        element.append(searchForm);

        const searchInput = document.createElement(`input`);
        searchInput.setAttribute(`type`, `text`);
        searchInput.setAttribute(`class`, `form-control form-inline`);
        searchInput.setAttribute(`id`, `searchInput`);
        searchInput.setAttribute(`placeholder`, `Search for a user...`);
        searchInput.addEventListener(`keyup`, (event) =>
        {
            if (event.key === `Enter`)
            {
                event.preventDefault();
                document.querySelector(`#searchButton`).click();
            }
        });

        searchForm.append(searchInput);

        const searchButton = document.createElement(`button`);
        searchButton.setAttribute(`class`, `btn btn-primary`);
        searchButton.setAttribute(`id`, `searchButton`);
        searchButton.setAttribute(`type`, `button`);
        searchButton.setAttribute(`onclick`, `searchUser();`);
        searchButton.innerHTML = `Search`;
        searchForm.append(searchButton);

        if (window.location.search.includes(`search=`))
        {
            const searchResetButton = document.createElement(`button`);
            searchResetButton.setAttribute(`class`, `btn btn-secondary`);
            searchResetButton.setAttribute(`id`, `searchResetButton`);
            searchResetButton.setAttribute(`type`, `button`);
            searchResetButton.setAttribute(`onclick`, `resetSearch();`);
            searchResetButton.innerHTML = `Clear Search`;
            searchForm.append(searchResetButton);
            searchInput.value = window.location.search.split(`search=`)[1];
        }
        const hr2 = document.createElement(`hr`);
        element.append(hr2);
    }

    const previousPage = document.createElement(`button`);
    previousPage.setAttribute(`class`, `btn btn-secondary`);
    previousPage.setAttribute(`type`, `button`);
    previousPage.setAttribute(`onclick`, `tableNavigationAction(-1);`);
    previousPage.innerHTML = `Previous Page`;
    let page = window.location.search;
    page = page.replace(`?page=`, ``);
    page = page.split(`&`)[0];
    if (page === `1`)
        previousPage.setAttribute(`disabled`, `true`);

    element.append(previousPage);

    const nextPage = document.createElement(`button`);
    nextPage.setAttribute(`class`, `btn btn-primary`);
    nextPage.setAttribute(`type`, `button`);
    nextPage.setAttribute(`onclick`, `tableNavigationAction(1);`);
    nextPage.innerHTML = `Next Page`;

    if (users.length !== 100)
        nextPage.setAttribute(`disabled`, `true`);

    element.append(nextPage);
}

$(`#editModal`).on(`show.bs.modal`, function (event)
{
    var button = $(event.relatedTarget);
    var username = button.data(`username`);
    var index = button.data(`index`);
    var modal = $(this);
    modal.find(`.modal-title`).text(`Edit User: ${ username }`);
    modal.find(`.modal-body #modal-username`).val(username);
    modal.find(`.modal-body #modal-email`).val(users[index].email);
    modal.find(`.modal-body #editingUserOldName`).val(username);
    modal.find(`.modal-body #modal-displayName`).val(users[index].displayName);
    modal.find(`.modal-body #modal-bio`).val(users[index].bio);
    modal.find(`.modal-body #modal-image`).val(users[index].image);
    let links = users[index].links;
    links = JSON.parse(links);
    const jsonLinks = links;
    links = JSON.stringify(links, undefined, 2);
    let linkNames = users[index].linkNames;
    linkNames = JSON.parse(linkNames);
    const jsonLinkNames = linkNames;
    linkNames = JSON.stringify(linkNames, undefined, 2);
    modal.find(`.modal-body #modal-links`).val(links);
    modal.find(`.modal-body #modal-linkNames`).val(linkNames);
    modal.find(`.modal-body #modal-links`).attr(`rows`, jsonLinks.length + 2);
    modal.find(`.modal-body #modal-linkNames`).attr(`rows`, jsonLinkNames.length + 2);
    if (users[index].ageGated === `checked`)
        modal.find(`.modal-body #modal-ageGated`).prop(`checked`, true);
    else
        modal.find(`.modal-body #modal-ageGated`).prop(`checked`, false);
});

$(`#editShadowModal`).on(`show.bs.modal`, function (event)
{
    var button = $(event.relatedTarget);
    var username = button.data(`username`);
    var index = button.data(`index`);
    var modal = $(this);
    modal.find(`.modal-title`).text(`Edit Shadow User: ${ username }`);
    modal.find(`.modal-body #modal-edit-shadow-displayName`).val(users[index].displayName);
});

/**
 * @name verifyUser
 * @description Verifies a user
 * @param {string} username The username to take action on
 */
async function verifyUser(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/verifyUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
        }),
    });
    window.location.reload();
}

/**
 * @name unverifyUser
 * @description Unverifies a user
 * @param {string} username The username to take action on
 */
async function unverifyUser(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/unverifyUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
        }),
    });
    window.location.reload();
}

/**
 * @name promoteUser
 * @description Promotes a user to Staff
 * @param {string} username The username to take action on
 */
async function promoteUser(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/promoteUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
        }),
    });
    window.location.reload();
}

/**
 * @name demoteUser
 * @description Demotes a user from Staff
 * @param {string} username The username to take action on
 */
async function demoteUser(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/demoteUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
        }),
    });
    window.location.reload();
}

/**
 * @name suspendUser
 * @description Suspends a user
 * @param {string} username The username to take action on
 */
async function suspendUser(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/suspendUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
        }),
    });
    window.location.reload();
}

/**
 * @name unsuspendUser
 * @description Unsuspends a user
 * @param {string} username The username to take action on
 */
async function unsuspendUser(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/unsuspendUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
        }),
    });
    window.location.reload();
}

/**
 * @name deleteUser
 * @description Deletes a user
 * @param {string} username The username to take action on
 */
async function deleteUser(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/deleteUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
        }),
    });
    window.location.reload();
}

/**
 * @name extendUser
 * @description Extends a user's subscription
 * @param {string} username The username to take action on
 * @param {number} months The number of months to extend the subscription by
 */
async function extendUser(username, months)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    await $.ajax(`${ protocol }//${ domain }/staff/promoteUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
            months,
        }),
    });
    window.location.reload();
}

/**
 * @name prepareUserEdit
 * @description Grab data from the user edit modal to send to update the user.
 */
function prepareUserEdit()
{
    const oldUsername = document.querySelector(`#editingUserOldName`).value;
    const newUsername = document.querySelector(`#modal-username`).value;
    const email = document.querySelector(`#modal-email`).value;
    const displayName = document.querySelector(`#modal-displayName`).value;
    const bio = document.querySelector(`#modal-bio`).value;
    const image = document.querySelector(`#modal-image`).value;
    const links = document.querySelector(`#modal-links`).value;
    const linkNames = document.querySelector(`#modal-linkNames`).value;
    const ageGated = document.querySelector(`#modal-ageGated`).checked;
    sendUserEdit(oldUsername, newUsername, email, displayName, bio, image, links, linkNames, ageGated);
}

/**
 * @name sendUserEdit
 * @description Sends the user edit data to the server.
 * @param {string} oldUsername The old username of the user
 * @param {string} newUsername The new username of the user
 * @param {string} email The email of the user
 * @param {string} displayName The display name of the user
 * @param {string} bio The bio of the user
 * @param {string} image The image of the user
 * @param {Array} links The links of the user
 * @param {Array} linkNames The link names of the user
 * @param {boolean} ageGated Whether the user is age gated or not
 */
async function sendUserEdit(oldUsername, newUsername, email, displayName, bio, image, links, linkNames, ageGated)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    const index = users.findIndex((user) => user.username === oldUsername);
    const user = users[index];

    let dataToSend = {
        username: oldUsername,
    };

    if (displayName !== user.displayName)
    {
        dataToSend = {
            ...dataToSend,
            displayName,
        };
    }

    if (bio !== user.bio)
    {
        if (bio === ``)
            bio = `No bio yet.`;
        dataToSend = {
            ...dataToSend,
            bio,
        };
    }
    if (image !== user.image)
    {
        dataToSend = {
            ...dataToSend,
            image,
        };
    }

    if (email !== user.email)
    {
        dataToSend = {
            ...dataToSend,
            email,
        };
    }

    // flatten links and linkNames (no spaces, all one line)
    links = links.replace(/ /g, ``);
    links = links.replace(/\r/g, ``);
    links = links.replace(/\n/g, ``);
    linkNames = linkNames.replace(/ {2}/g, ``);
    linkNames = linkNames.replace(/\r/g, ``);
    linkNames = linkNames.replace(/\n/g, ``);

    if (links !== user.links)
    {
        dataToSend = {
            ...dataToSend,
            links,
        };
    }

    if (linkNames !== user.linkNames)
    {
        dataToSend = {
            ...dataToSend,
            linkNames,
        };
    }

    if (ageGated !== user.ageGated)
    {
        dataToSend = {
            ...dataToSend,
            ageGated,
        };
    }

    // ! This should always be the last thing we check.
    if (newUsername !== user.username)
    {
        dataToSend = {
            ...dataToSend,
            newUsername,
        };
    }

    await $.ajax(`${ protocol }//${ domain }/staff/editUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify(dataToSend),
    });
    window.location.reload();
}

/**
 * @name shadowUserEdit
 * @description Change redirect URL
 * @param {string} username The shadow profile to update
 */
async function shadowUserEdit(username)
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    const newRedirect = document.querySelector(`#modal-edit-shadow-displayName`).value;
    await $.ajax(`${ protocol }//${ domain }/staff/editUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username,
            displayName: newRedirect,
        }),
    });
    window.location.reload();
}

/**
 * @name createShadowUser
 * @description Prepares shadow user creation.
 */
async function createShadowUser()
{
    const protocol = window.location.protocol;
    const domain = window.location.href.split(`/`)[2];
    const userToCreate = document.querySelector(`#modal-shadow-username`).value;
    const userToRedirectTo = document.querySelector(`#modal-shadow-redirect`).value;

    if (userToCreate === `` || userToRedirectTo === `` || userToCreate === userToRedirectTo)
        return;

    await $.ajax(`${ protocol }//${ domain }/staff/createShadowUser`, {
        type: `POST`,
        contentType: `application/json`,
        data: JSON.stringify({
            username: userToCreate,
            redirect: userToRedirectTo,
        }),
    });
    window.location.reload();
}

/**
 * @name tableNavigationAction
 * @description Handles going to the next/previous page of the table.
 * @param {number} direction The direction to go in (1 for next, -1 for previous)
 */
function tableNavigationAction(direction)
{
    let currentPage = window.location.search;
    currentPage = currentPage.replace(`?page=`, ``);
    currentPage = currentPage.split(`&`)[0];
    if (direction === -1)
    {
        if (currentPage === 1)
            return;

        currentPage -= 1;
    }
    else if (direction === 1)
        currentPage += 1;

    window.location.href = `/staff?page=${ currentPage }`;
}

/**
 * @name searchUser
 * @description Searches for a user.
 */
function searchUser()
{
    const userInput = document.querySelector(`#searchInput`).value;
    if (userInput !== ``)
        window.location.href = `/staff?page=1&search=${ userInput }`;
}

/**
 * @name resetSearch
 * @description Removes the search query from the URL.
 */
function resetSearch()
{
    window.location.href = `/staff?page=1`;
}
