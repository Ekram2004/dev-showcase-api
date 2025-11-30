// server.js
require("dotenv").config();
const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const cors = require("cors");
const { pool, query } = require("./config/db"); // Centralized DB connection
const { globalLimiter, loginLimiter } = require("./middleware/rateLimitters");
const errorHandler = require("./middleware/errorHandler");

// --- GraphQL specific imports (will be created soon) ---
const typeDefs = require("./graphql/schema");
const resolvers = require("./graphql/resolvers");
const jwt = require("jsonwebtoken"); // For GraphQL context

// --- Initialize Express App ---
const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "*" })); // For development, allow all origins

// --- Apply Global Rate Limiter to ALL REST API requests ---
app.use("/api", globalLimiter); // Apply only to /api routes

// --- REST API Versioning: Mount routes under /api/v1 ---
const authRoutesV1 = require("./routes/v1/auth");
const userRoutesV1 = require("./routes/v1/users");
const skillsRoutesV1 = require("./routes/v1/skills"); // Will create these next
const userSkillsRoutesV1 = require("./routes/v1/userSkills");
const inquiriesRoutesV1 = require("./routes/v1/inquiries");

// Apply specific rate limiter for login route
app.use("/api/v1/auth/login", loginLimiter);
app.use("/api/v1/auth", authRoutesV1);
app.use("/api/v1/users", userRoutesV1);
app.use("/api/v1/skills", skillsRoutesV1);
app.use("/api/v1/user-skills", userSkillsRoutesV1);
app.use("/api/v1/inquiries", inquiriesRoutesV1);

// --- GraphQL Server Setup ---
async function startApolloServer() {
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      let user = null;
      const token = req.headers.authorization
        ? req.headers.authorization.split(" ")[1]
        : "";

      if (token) {
        try {
          const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
          const userWithRoles = await query(
            "SELECT u.id, u.username, u.email, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
            [decodedToken.userId],
          );
          if (userWithRoles.rows.length > 0) {
            user = {
              userId: userWithRoles.rows[0].id,
              username: userWithRoles.rows[0].username,
              roles: [userWithRoles.rows[0].role_name],
            };
          }
        } catch (err) {
          console.error("Invalid JWT for GraphQL context:", err.message);
        }
      }
      return { user, query }; // Pass user info and DB query function to GraphQL resolvers
    },
    introspection: process.env.NODE_ENV !== "production", // Enable introspection in development
    playground:
      process.env.NODE_ENV !== "production"
        ? {
            // Enable Apollo Sandbox in development
            endpoint: "/graphql",
          }
        : false,
  });

  await apolloServer.start();
  apolloServer.applyMiddleware({ app, path: "/graphql" });

  // --- Fallback Route for REST API ---
  app.get("/", (req, res) => {
    res.send("DevShowcase REST & GraphQL API is running!");
  });

  // --- Centralized Error Handling Middleware (for REST API) ---
  app.use(errorHandler);

  // --- Start Server ---
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`REST API available at http://localhost:${port}/api/v1`);
    console.log(
      `GraphQL Playground available at http://localhost:${port}/graphql`,
    );
    pool
      .connect()
      .then(() => console.log("Successfully connected to PostgreSQL."))
      .catch((err) =>
        console.error("Error connecting to PostgreSQL:", err.stack),
      );
  });
}

startApolloServer();
