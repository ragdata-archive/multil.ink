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
    `<i class="fa-brands fa-bandcamp"></i> `,
    `<i class="fa-brands fa-behance"></i> `,
    `<i class="fa-brands fa-bilibili"></i> `,
    `<i class="fa-brands fa-bitbucket"></i> `,
    `<i class="fa-brands fa-codepen"></i> `,
    `<i class="fa-brands fa-dailymotion"></i>`,
    `<i class="fa-brands fa-deezer"></i>`,
    `<i class="fa-brands fa-dev"></i>`,
    `<i class="fa-brands fa-deviantart"></i>`,
    `<i class="fa-brands fa-discord"></i> `,
    `<i class="fa-brands fa-discord"></i> `,
    `<i class="fa-brands fa-discord"></i> `,
    `<i class="fa-brands fa-dribbble"></i> `,
    `<i class="fa-brands fa-ebay"></i> `,
    `<i class="fa-brands fa-etsy"></i> `,
    `<i class="fa-brands fa-facebook"></i> `,
    `<i class="fa-brands fa-facebook"></i> `,
    `<i class="fa-brands fa-figma"></i> `,
    `<i class="fa-brands fa-flickr"></i> `,
    `<i class="fa-brands fa-github"></i> `,
    `<i class="fa-brands fa-gitlab"></i> `,
    `<i class="fa-brands fa-goodreads"></i> `,
    `<i class="fa-brands fa-guilded"></i> `,
    `<i class="fa-brands fa-imdb"></i> `,
    `<i class="fa-brands fa-instagram"></i> `,
    `<i class="fa-brands fa-instagram"></i> `,
    `<i class="fa-brands fa-itch-io"></i> `,
    `<i class="fa-brands fa-jsfiddle"></i> `,
    `<i class="fa-brands fa-keybase"></i> `,
    `<i class="fa-brands fa-kickstarter"></i> `,
    `<i class="fa-brands fa-lastfm"></i> `,
    `<i class="fa-brands fa-linkedin"></i> `,
    `<i class="fa-brands fa-medium"></i> `,
    `<i class="fa-solid fa-music"></i> `,
    `<i class="fa-brands fa-patreon"></i> `,
    `<i class="fa-brands fa-paypal"></i> `,
    `<i class="fa-brands fa-paypal"></i> `,
    `<i class="fa-brands fa-pinterest"></i> `,
    `<i class="fa-brands fa-spotify"></i> `,
    `<i class="fa-brands fa-pinterest"></i> `,
    `<i class="fa-brands fa-qq"></i> `,
    `<i class="fa-brands fa-quora"></i> `,
    `<i class="fa-brands fa-reddit"></i> `,
    `<i class="fa-brands fa-skype"></i> `,
    `<i class="fa-brands fa-slack"></i> `,
    `<i class="fa-brands fa-snapchat"></i> `,
    `<i class="fa-brands fa-soundcloud"></i> `,
    `<i class="fa-brands fa-spotify"></i> `,
    `<i class="fa-brands fa-steam"></i> `,
    `<i class="fa-brands fa-strava"></i> `,
    `<i class="fa-brands fa-telegram"></i> `,
    `<i class="fa-brands fa-telegram"></i> `,
    `<i class="fa-brands fa-telegram"></i> `,
    `<i class="fa-brands fa-tiktok"></i> `,
    `<i class="fa-brands fa-trello"></i> `,
    `<i class="fa-brands fa-tumblr"></i> `,
    `<i class="fa-brands fa-twitch"></i> `,
    `<i class="fa-brands fa-twitter"></i> `,
    `<i class="fa-brands fa-vimeo"></i> `,
    `<i class="fa-brands fa-vk"></i> `,
    `<i class="fa-brands fa-weibo"></i> `,
    `<i class="fa-brands fa-whatsapp"></i> `,
    `<i class="fa-brands fa-wikipedia-w"></i> `,
    `<i class="fa-brands fa-youtube"></i> `,
    `<i class="fa-brands fa-youtube"></i> `,
];
const faBrandDomainList = [
    `bandcamp.com`,
    `behance.net`,
    `bilibili.com`,
    `bitbucket.org`,
    `codepen.io`,
    `dailymotion.com`,
    `deezer.com`,
    `dev.to`,
    `deviantart.com`,
    `discord.com`,
    `discordapp.com`,
    `discord.gg`,
    `dribbble.com`,
    `ebay.com`,
    `etsy.com`,
    `facebook.com`,
    `fb.com`,
    `figma.com`,
    `flickr.com`,
    `github.com`,
    `gitlab.com`,
    `goodreads.com`,
    `guilded.gg`,
    `imdb.com`,
    `instagr.am`,
    `instagram.com`,
    `itch.io`,
    `jsfiddle.net`,
    `keybase.io`,
    `kickstarter.com`,
    `last.fm`,
    `linkedin.com`,
    `medium.com`,
    `music.apple.com`,
    `patreon.com`,
    `paypal.me`,
    `paypal.com`,
    `pinterest.com`,
    `open.spotify.com`,
    `pinterest.com`,
    `qq.com`,
    `quora.com`,
    `reddit.com`,
    `skype.com`,
    `slack.com`,
    `snapchat.com`,
    `soundcloud.com`,
    `spotify.com`,
    `steamcommunity.com`,
    `strava.com`,
    `telegram.org`,
    `telegram.me`,
    `t.me`,
    `tiktok.com`,
    `trello.com`,
    `tumblr.com`,
    `twitch.tv`,
    `twitter.com`,
    `vimeo.com`,
    `vk.com`,
    `weibo.com`,
    `whatsapp.com`,
    `wikipedia.org`,
    `youtu.be`,
    `youtube.com`
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

const featuredContentEmbeds = [
    {
        url: `youtube.com`,
        correctUrl: `https://www.youtube-nocookie.com/embed/`,
        embed: `<iframe width="560" height="315" src="%url%" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
    },
    {
        url: `youtu.be`,
        correctUrl: `https://www.youtube-nocookie.com/embed/`,
        embed: `<iframe width="560" height="315" src="%url%" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
    },
    {
        url: `twitch.tv`,
        correctUrl: `https://player.twitch.tv/?channel=%url%&parent=${ window.location.host }`,
        embed: `<iframe src="%url%" frameborder="0" allowfullscreen="true" scrolling="no" height="378" width="620"></iframe>`,
    },
    {
        url: `soundcloud.com`,
        embed: `<iframe width="65%" height="166" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?url=%url%&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false"></iframe>`
    },
    {
        url: `spotify.com`,
        correctUrl: `https://open.spotify.com/embed/`,
        embed: `<iframe style="border-radius:12px" src="%url%" width="65%" height="300" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`,
    },
    {
        url: `music.apple.com`,
        correctUrl: `https://embed.music.apple.com/`,
        embed: `<iframe allow="encrypted-media *; clipboard-write" frameborder="0" height="175" style="width:100%;max-width:660px;overflow:hidden;background:transparent;" src="%url%"></iframe>`,
    }
];
// based on what url was provided in featuredContent, use the correct embed
for (const embed of featuredContentEmbeds)
{
    if (featuredContent.includes(embed.url))
    {
        const embedDiv = document.querySelector(`#featuredContent`);
        if (embed.correctUrl)
        {
            if (embed.url === `youtube.com`)
            {
                featuredContent = featuredContent.split(`/`)[3];
                featuredContent = featuredContent.split(`?`)[1].slice(2); // just get the video ID
                featuredContent = featuredContent.split(`&`)[0];
            }
            if (embed.url === `youtu.be`)
                featuredContent = featuredContent.split(`/`)[3];
            if (embed.url === `twitch.tv`)
            {
                featuredContent = featuredContent.split(`/`)[3];
                embed.correctUrl = embed.correctUrl.replace(
                    `%url%`,
                    featuredContent
                );
                embedDiv.innerHTML = embed.embed.replace(
                    `%url%`,
                    embed.correctUrl
                );
                break;
            }
            if (embed.url === `spotify.com`)
                featuredContent = featuredContent.split(`com/`)[1];
            if (embed.url === `music.apple.com`)
                featuredContent = featuredContent.split(`com/`)[1];

            featuredContent = `${ embed.correctUrl }${ featuredContent }`;
        }
        embedDiv.innerHTML = embed.embed.replace(
            `%url%`,
            featuredContent
        );
        // load any <script> tags that were added via callback
        const scripts = embedDiv.querySelectorAll(`script`);
        for (const script of scripts)
        {
            const newScript = document.createElement(`script`);
            newScript.src = script.src;
            script.parentNode.replaceChild(newScript, script);
        }
    }
}
