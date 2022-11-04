for (let index = 1; index < 500; index++)
{
    console.log(`INSERT INTO userAuth (username, email, password) VALUES ("${ index }", "${ index }@${ index }.${ index }", "123");`);
    console.log(`INSERT INTO users (username, verified, paid, subExpires, displayName, bio, image, links, linkNames) VALUES ("${ index }", 0, 0, "", "${ index }", "No bio yet.", "", '["https://twitter.com/${ index }","https://instagram.com/${ index }","https://youtube.com/${ index }"]', '["tw${ index }","ig${ index }","yt${ index }"]');`);
}
