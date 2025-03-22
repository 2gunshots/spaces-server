import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DB_URL;
// console.log(process.env.DB_URL);
// const connectionString =
//     "postgresql://spaces_owner:npg_ueFDU96sCAKc@ep-calm-recipe-a5jp5ibe-pooler.us-east-2.aws.neon.tech/spaces?sslmode=require";

// const db = new pg.Client({
//     user: "postgres",
//     host: "localhost",
//     database: "Spaces",
//     password: "gunshots",
//     port: 5432,
// });

const db = new pg.Client({
    connectionString: connectionString,
});
db.connect()
    .then(() => {
        console.log("Connected to the Neon cloud PostgreSQL database!");
    })
    .catch((err) => {
        console.error("Error connecting to the database:", err);
    });

export default db;
