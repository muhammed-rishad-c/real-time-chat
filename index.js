import express from 'express';
import bodyParser from 'body-parser';
import http from 'http';
import { Server } from 'socket.io';
import pg from 'pg';
import session from 'express-session';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "rchat",
    password: "rishadkhalid",
    port: 5432,
});

let users = {};

db.connect((err) => {
    if (err) console.log("Error in connecting db " + err.stack);
    else console.log("Database is connected");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'secret-key', // Change this to a strong secret key
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('signup');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/submit-login', async (req, res) => {
    const username = req.body.username;
    const phonenumber = req.body.phone;
    console.log(username + " is the name");

    if (username) {
        try {
            const query = `INSERT INTO users (username, phonenumber) VALUES ($1, $2)`;
            const values = [username, phonenumber];
            await db.query(query, values);
        } catch (e) {
            console.log("Error in inserting user detail in db" + e);
        }
        req.session.username = username;
        res.render('index', { username: username });
    } else {
        res.send('Username is required!');
    }
});

app.post('/submit', async (req, res) => {
    const username = req.body.username;
    try {
        const query = `SELECT username FROM users WHERE username = $1`;
        const values = [username];
        const result = await db.query(query, values);
        if (result.rows.length > 0) {
            req.session.username = username;
            res.render('index', { username: username });
        } else {
            console.log("Cannot find name in the db");
            const msg = 'Login first';
            res.render('signup', { warning: msg, username: username });
        }
    } catch (e) {
        console.log("Error in searching username in db");
        res.redirect('login');
    }
});

app.post('/chat', async (req, res) => {
    const user2 = req.body.name;
    const user1 = req.session.username;
    console.log("user2: " + user2);
    console.log("user1: " + user1);
    
    try {
        const query = `
            SELECT id, sender, receiver, message, timestamp 
            FROM messages 
            WHERE (sender = $1 AND receiver = $2) OR (sender = $2 AND receiver = $1)
            ORDER BY timestamp ASC
        `;
        const values = [user1, user2];
        const result = await db.query(query, values);
        res.render('chat', { user1: user1, user2: user2, messages: result.rows });
    } catch (e) {
        console.log("Error fetching messages from database: " + e);
        res.send("Error fetching messages");
    }
});



app.post('/delete-message', async (req, res) => {
    const messageId = req.body.id;

    try {
        const query = `DELETE FROM messages WHERE id = $1`;
        const values = [messageId];
        await db.query(query, values);
        res.sendStatus(200); // OK
    } catch (e) {
        console.log("Error deleting message from database: " + e);
        res.sendStatus(500); // Internal Server Error
    }
});


app.get('/index',(req,res)=>{
    res.render('index',{username:req.session.username})
})


io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('set username', (username) => {
        users[username] = socket.id;
        socket.username = username; // Store the username in the socket object
        socket.emit('username set', username);
        console.log(`User ${username} connected with socket ID ${socket.id}`);
    });

    socket.on('chat message', (msg) => {
        const username = socket.username;
        io.emit('chat message', { username: username, message: msg });
    });

    socket.on('private message', async ({ to, message }) => {
        console.log("message is on index "+message);
        
        const targetSocketId = users[to];
        console.log("rec id "+targetSocketId);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('private message', {
                from: socket.username,
                message: message
            });
            try {
                const query = `INSERT INTO messages(sender, receiver, message) VALUES($1, $2, $3)`;
                const values = [socket.username, to, message];
                await db.query(query, values);
                console.log("message added");
                
            } catch (e) {
                console.log("Error in inserting message in db " + e.stack);
            }
        }
    });

    socket.on('disconnect', () => {
        const username = socket.username;
        console.log(`User ${username} disconnected`);
        delete users[username];
    });
});

server.listen(3000, () => {
    console.log('Listening on *:3000');
});
