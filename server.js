require('dotenv').config();
const { error, Console } = require('console');
const express = require('express'); // framework
const sqlite3 = require('sqlite3').verbose(); //database
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const app = express(); //set framework
const PORT = 3000; // port
app.use(express.urlencoded({extended: true}));
app.set('view engine', 'ejs'); //HTML and Javascript library for inserting points and username

//Create or start database;
const database = new sqlite3.Database('./user_points.db', (err) => {
    if (err){
        console.error("Database connection error: ", error.message);
    } else {
        console.log("Connected to User Database.");

        database.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            points INTEGER
            )`, (err) => {} 
        );
    }
});

//Directs the serve output to the index.html file
const path = require('path');
app.use(express.static(path.join(__dirname, 'client')));
app.use('/admin_assets', express.static(path.join(__dirname, 'admins')));
app.use(session({
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, //turn to true only in HTTPS
        maxAge: 1000 * 60 * 60 * 24
    },
    store: new SQLiteStore({ 
        db: 'user_points.db', 
        dir: '.' // Directory where db is located
    }),
}));

//Sign in commands
app.post('/signin', (req, res) => {
    const checkUser = req.body.username;
    database.get('SELECT username, points FROM users WHERE username = ?', [checkUser], (err, userProfile) => {
        if (err) {
            console.error(err.mesasge);
            return res.send("Database error during login.");
        }
        if (userProfile) {
            console.log("Found user:", userProfile.username, "Points:", userProfile.points);
            return res.render('profile', {
                username: userProfile.username, points: userProfile.points
            });
        } else {
            return res.redirect('/?status=signin_failed');
        }
    });
});


//Sign up command
app.post('/signup', (req, res) => {
    const newUser = req.body.newUser;
    database.run(`INSERT INTO users (username, points) VALUES (?, ?)`, [newUser, 0], function(err) {
        if (err){
            return res.redirect('/?status=signup_failed');
        }

        console.log(`User ${newUser} created with ID: ${this.lastID}`);
        return res.redirect("/?status=signup_success");
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
        sql = 'UPDATE users SET points = points + ?';
        params = [pointsChange];
        return runUpdate(sql, params, res, pointsChange);
    } else if (targetUsername){
        return checkUser(targetUsername, res, pointsChange);
    } else {
        return res.status(400).send("Username is required");
    }
});

//checks if suer is vaild
function checkUser(targetUsername, res, pointsChange){
    database.get('SELECT username FROM users WHERE username = ?', [targetUsername], (err, userProfile) => {
            if (err){
                console.error("Database Check Error: ", err.message);
                return res.status(500).send("Database Check Failed");
            }
            if (!userProfile) {
                return res.status(400).send("Invaild Username");
            }

            const sql = 'UPDATE users SET points = points + ? WHERE username = ?';
            const params = [pointsChange, targetUsername];
            return runUpdate(sql, params, res, pointsChange);
    });
}

function runUpdate(sql, params, res, pointsChange) {
        database.run(sql, params, function(err) {
        if (err){
            console.error("Database Update Error:", err.message);
            return res.status(500).redirect("admin/dashborad/?status=update-failed")
        }

        const message = `${this.changes} user(s) had their points updated. Update value is ${pointsChange}`;
        console.log(message);

        return res.redirect(`/admin/dashborad/?status=update-success`);
    });
}

app.post('/admin/output-database', requireAdmin, (req, res) =>{
    console.log("Outputted Database");
    database.all('SELECT id, username, points FROM users', [], (err, userObj) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Failed to retrieve user data.");
        }
        
        return res.render('userlist', { 
            user: userObj});
    });
});

app.post('/admin/signin', (req, res) => {

    const checkUser = req.body.adminUser;
    const checkPass = req.body.password;

    const USER_NAME = process.env.ADMIN_USERNAME;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;


    if (checkUser === USER_NAME && checkPass === ADMIN_PASSWORD){
        req.session.isAdmin = true;
        console.log("Admin: " + req.session.isAdmin);

        return req.session.save((err) => {
            if (err) {
                console.error("Session save failed:", err);
                return res.redirect('/?status=error_session_save');
            }
            return res.redirect('/admin/dashborad');
        });
    } 
    return res.redirect('/?status=failed');
});

app.post('/admin/delete-user', requireAdmin, (req,res) =>{
    const username = req.body.username;
    if (!username || username.toUpperCase() === 'ALL') {
         // Prevent accidental deletion of all users or null request
         return res.status(400).redirect("/admin/dashborad/?status=user-not-found");
    }
    
    database.get('SELECT username FROM users WHERE username = ?', [username], (err, userProfile) => {
      if (err){
        console.error("Databae Check Error: ", err.message);
        return res.status(500).redirect("/admin/dashborad/?status=delete-failed");
      }
      
      if (!userProfile){
        return res.status(404).redirect("/admin/dashborad/?status=user-not-found");
      }

    sql = "DELETE FROM users WHERE username = ?";
    params = [username];
    return runDelete(sql, params, res, username);
    });
});
function runDelete(sql, params, res, username){
    database.run(sql, params, function(err) {
        if (err){
            console.log("Failed to delete user: " + err.message);
            return res.status(500).redirect("/admin/dashborad/?status=delete-failed");
        }

        if (this.changes === 0){
            //Safety net
             return res.status(404).redirect("/admin/dashborad/?status=user-not-found");
        }

        console.log(`${username} was deleted from the database.`);
        return res.status(302).redirect("/admin/dashborad/?status=delete-success");
    });
}


app.get('/admin/dashborad', requireAdmin, (req, res) => {
    return res.sendFile(path.join(__dirname, 'admins', 'admin.html'));
});

function requireAdmin(req, res, next) {
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
