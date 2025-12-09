require('dotenv').config();
const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL; //Input Neon's url
const express = require('express'); // framework
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const app = express(); //set framework
const PORT = process.env.PORT || 3000; // Change to neon's port
app.use(express.urlencoded({extended: true}));
app.set('view engine', 'ejs'); //HTML and Javascript library for inserting points and username

const pool = new Pool({
    connectionString: connectionString,
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // How long to wait for a connection
});
const database = pool;

//Create or start database;
database.connect()
    .then(() => {
        console.log("Connected to PostgreSQL User Database.");
        return database.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                points INTEGER
            )
        `); 
    })
    .then(() => {
        console.log("Verified 'users' table exists.");
    })
    .catch(err => {
        console.error("Database initialization error:", err.stack);
    });

//Directs the serve output to the index.html file
const path = require('path');
const { default: PG } = require('pg');
app.use(express.static(path.join(__dirname, 'client')));
app.use('/admin_assets', express.static(path.join(__dirname, 'admins')));
app.set('trust proxy', 1);

//cookies
app.use(session({
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        maxAge: 1000 * 60 * 60 * 24
    },
    store: new PgStore({
        pool: pool,
        tabelName: 'session_data',
        createTableIfMissing: true
    }),
}));

//Sign in commands
app.post('/signin', (req, res) => {
    const checkUser = req.body.username;
    database.query('SELECT username, points FROM users WHERE username = $1', [checkUser])
    .then(userProfile => {
        if (result.rows.length === 0){
            console.log(`User '${checkUser}' not found.`);
            return res.redirect('/?status=signin_failed');
        }

        console.log("Found user:", userProfile.row[0].username, "Points:", userProfile.row[0].points);
        return res.render('profile', {
            username: userProfile.username,
            points: userProfile.points
        });
    })
    .catch(err => {
        console.error("Database error when getting user:", err.stack);
        return res.status(500).send('An server error occurred');
    });
});


//Sign up command
app.post('/signup', (req, res) => {
    const newUser = req.body.newUser;
    database.query(`INSERT INTO users (username, points) VALUES ($1, $2)`, [newUser, 0])
    .then(() => {
        console.log(`User ${newUser} created successfully.`);
        return res.redirect("/?status=signup_success");  
    })
    .catch(err =>{
        if (err.code === '23505') {
                console.warn(`Signup Failed: Username '${newUser}' already exists.`);
                return res.redirect("/?status=signup_failed");
        }
        console.error("Database error when adding user:", err.stack);
        return res.status(500).send('An server error occurred');
    });
});

//Update point command --> highly sensitive 
app.post('/admin/update-points', requireAdmin, (req, res) => {
    const targetUsername = req.body.targetUsername;
    let pointsChange = parseInt(req.body.pointsChange);

    if (isNaN(pointsChange)){
        return res.status(400).send("Invaild point value.");
    }
    let sql ; 
    let params;

    if (targetUsername.toUpperCase() === 'ALL') {
        sql = 'UPDATE users SET points = points + $1';
        params = [pointsChange];
        return runUpdate(sql, params, res, pointsChange);
    } else if (targetUsername){
        return checkUser(targetUsername, res, pointsChange);
    } else {
        return res.status(400).send("Username is required");
    }
});


//checks if user is vaild
function checkUser(targetUsername, res, pointsChange){
    database.query('SELECT username FROM users WHERE username = $1', [targetUsername])
    .then(result => {

        if (result.rows.length === 0) {
            console.warn(`Attempted update on non-existent user: ${targetUsername}`);
            return res.status(404).redirect("/admin/dashborad/?status=user-not-found");
        }
            const sql = 'UPDATE users SET points = points + $1 WHERE username = $2';
            const params = [pointsChange, targetUsername];
            return runUpdate(sql, params, res, pointsChange);
    })
    .catch(err =>{
        console.error("Database Check Error: ", err.message);
        return res.status(500).redirect("admin/dashborad/?status=update-failed");        
    });
}


function runUpdate(sql, params, res, pointsChange) {
        database.query(sql, params)
        .then(result => {
            console.log(`Sucessfully updated ${result.rowCount} user points by ${pointsChange}`);
            return res.redirect(`/admin/dashborad/?status=update-success`);
        })
        .catch(err => {
                console.error("Database Update Error:", err.message);
                return res.status(500).redirect("admin/dashborad/?status=update-failed");        
        });
}

app.post('/admin/output-database', requireAdmin, (req, res) =>{
    console.log("Outputted Database");
    database.query('SELECT id, username, points FROM users')
    .then(result => {
        const userObj = result.rows;
        return res.render('userlist', {user: userObj});
    })
    .catch(err => {
        console.error("Database query error: ", err.stack);
        return res.status(500).send("Failed to retrieve user data.");
    });
});

app.post('/admin/signin', (req, res) => {

    const checkUser = req.body.adminUser;
    const checkPass = req.body.password;

    const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;


    if (checkUser === ADMIN_USERNAME && checkPass === ADMIN_PASSWORD){
        req.session.isAdmin = true;
        console.log("Admin: " + req.session.isAdmin);
        return res.redirect('/admin/dashborad');
    } 
    return res.redirect('/?status=failed');
});

app.get('/admin/dashborad', requireAdmin, (req, res) => {
    console.log("Reached dashborad");
    return res.sendFile(path.join(__dirname, 'admins', 'admin.html'));
});


app.post('/admin/delete-user', requireAdmin, (req,res) =>{
    const username = req.body.username;
    if (!username || username.toUpperCase() === 'ALL') {
         // Prevent accidental deletion of all users or null request
         return res.status(400).redirect("/admin/dashborad/?status=user-not-found");
    }

    database.query('SELECT username FROM users WHERE username = $1', [username])
    .then(result => {
        if (result.rows.length === 0){
            return res.status(404).redirect("/admin/dashborad/?status=user-not-found");
        }
        sql = "DELETE FROM users WHERE username = $1";
        params = [username];
        return runDelete(sql, params, res, username);
    })
    .catch(err => {
        console.error("Databae Check Error: ", err.stack);
        return res.status(500).redirect("/admin/dashborad/?status=delete-failed");
    });
});


function runDelete(sql, params, res, username){
    database.query(sql, params)
    .then(result => {
        if (result.rowCount === 0){
            return res.status(404).redirect("/admin/dashborad/?status=user-not-found");
        }

        console.log(`${username} was deleted from the database.`);
        return res.status(302).redirect("/admin/dashborad/?status=delete-success");
    })
    .catch(err =>{
        console.log("Failed to delete user: " + err.message);
        return res.status(500).redirect("/admin/dashborad/?status=delete-failed");
    });
}


function requireAdmin(req, res, next) {
    console.log("Acess reach required admin");
    if (req.session.isAdmin == true){
        return next();
    } else {
       return  res.status(403).redirect('/?status=access_denied');
    }
}

app.listen(PORT, function(err){
    if (err) console.log("Error in server setup");
    console.log("Server listening on Port", PORT);
});
