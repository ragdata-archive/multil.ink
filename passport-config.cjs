const SQLite = require(`better-sqlite3`);
const LocalStrategy = require(`passport-local`).Strategy;
const bcrypt = require(`bcrypt`);
const sql = new SQLite(`./db.sqlite`);

/**
 *
 * @param {*} passport Passport.js Object
 * @param {string} getUserByEmail Email of the user
 */
function initialize(passport, getUserByEmail)
{
    const authenticateUser = async (email, password, done) =>
    {
        const user = getUserByEmail(email.email);
        if (user === undefined)
            return done(undefined, false, { message: `Email/Password incorrect.` });

        try
        {
            const userPassword = await sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email).password;
            if (await bcrypt.compare(password, userPassword))
                return done(undefined, user);
            return done(undefined, false, { message: `Email/Password incorrect.` });
        }
        catch (error)
        {
            return done(error);
        }
    };

    passport.use(new LocalStrategy({ usernameField: `email` }, authenticateUser));

    passport.serializeUser((user, done) =>
    {
        done(undefined, user);
    });

    passport.deserializeUser((user, done) =>
    {
        done(undefined, user);
    });
}

module.exports = initialize;
