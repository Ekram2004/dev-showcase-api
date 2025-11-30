# DevShowcase API (Hybrid REST & GraphQL)

## Project Overview

The **DevShowcase API** is a robust backend platform designed for developers to manage and showcase their professional profiles, portfolio projects, technical skills, and blog posts. It offers a hybrid API approach, providing both a traditional RESTful interface for core operations (like authentication and admin tasks) and a GraphQL API for efficient, flexible data fetching and complex resource management (like portfolio projects and blog posts).

This project was built to demonstrate proficiency in:
•   Node.js & Express.js
•   PostgreSQL database management
•   Building RESTful APIs with best practices (versioning, error handling, validation, rate limiting)
•   Implementing GraphQL APIs with Apollo Server
•   Advanced Authentication (JWT with Refresh Tokens)
•   Comprehensive Authorization (Role-Based Access Control & Ownership-Based Authorization)
•   Modular project structure and separation of concerns

## Features

### RESTful API (`/api/v1`)
•   **Authentication:** User registration, login, JWT access & refresh token generation, token revocation (logout).
•   **User Management:** Public viewing of developer profiles, authenticated users manage their own profiles.
•   **Admin-level User Management:** Admins can view all users, modify any user's role, and delete any user.
•   **Skills Management (Master List):** Admins can create, update, and delete global technical skills (e.g., 'React', 'Node.js'). Public can view all skills.
•   **User Skills Management:** Authenticated users can add, update (proficiency level), and remove skills from their personal profile.
•   **Inquiry System:** Authenticated users can send messages to other developers. Users can view/delete their received inquiries. Admins can view/delete all inquiries.
•   **API Best Practices:** Input validation (`express-validator`), centralized error handling, rate limiting, CORS, API versioning.

### GraphQL API (`/graphql`)
•   **Complex Profile Fetching:** Efficiently retrieve a developer's full profile, including nested projects, skills, and blog posts, with a single query.
•   **Portfolio Project Management:** Authenticated users can create, update, and delete their own portfolio projects.
•   **Blog Post Management:** Authenticated users can create, publish, update, and delete their own blog posts.
•   **Flexible Data Queries:** Clients can request exactly the data they need, reducing over-fetching.
•   **GraphQL Best Practices:** Custom scalars (`Date`), TypeDefs & Resolvers, Field-level resolvers for nested data, integrated authentication and ownership authorization.

## Technologies Used

•   **Backend:** Node.js, Express.js
•   **Database:** PostgreSQL
•   **API Frameworks:** Apollo Server (for GraphQL)
•   **Authentication:** JSON Web Tokens (JWT), `bcryptjs` for password hashing
•   **Validation:** `express-validator`
•   **Other:** `dotenv`, `cors`, `express-rate-limit`, `ms`, `nodemon` (for development)

## Getting Started

Follow these instructions to set up and run the project locally.

### Prerequisites

•   Node.js (LTS version recommended)
•   PostgreSQL
•   `git`

### Installation

1.  **Clone the repository:**
bash
  git clone https://github.com/Ekram2004/dev-showcase-api
  cd dev-showcase-api
```

2. Install Node.js dependencies:
  
```
bash
  npm install

  ```

3. Set up your PostgreSQL database:
  •  Create a new PostgreSQL database (e.g., dev_showcase_db).
  •  Execute the SQL schema from docs/schema.sql (you'll create this file) to set up all tables, roles, enums, and triggers.
    
```
sql
    -- docs/schema.sql content (copy from Phase 1, Step 4)
    -- 1. roles table
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL
    );
    INSERT INTO roles (name) VALUES ('user'), ('admin') ON CONFLICT (name) DO NOTHING;

    -- 2. users table
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      bio TEXT,
      github_url VARCHAR(255),
      linkedin_url VARCHAR(255),
      portfolio_url VARCHAR(255),
      profile_picture_url VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. projects table
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      tech_stack TEXT,
      project_url VARCHAR(255),
      github_repo_url VARCHAR(255),
      image_url VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. skills table
    CREATE TABLE IF NOT EXISTS skills (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL
    );
    INSERT INTO skills (name) VALUES
      ('JavaScript'), ('Python'), ('Node.js'), ('React'), ('Vue.js'), ('Angular'),
      ('PostgreSQL'), ('MongoDB'), ('MySQL'), ('AWS'), ('Azure'), ('Docker'),
      ('Git'), ('GraphQL'), ('RESTful APIs'), ('TypeScript'), ('HTML'), ('CSS')
    ON CONFLICT (name) DO NOTHING;

    -- 5. user_skills junction table
    CREATE TYPE proficiency_level_enum AS ENUM ('beginner', 'intermediate', 'expert');
    CREATE TABLE IF NOT EXISTS user_skills (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      proficiency_level proficiency_level_enum NOT NULL DEFAULT 'intermediate',
      PRIMARY KEY (user_id, skill_id)
    );

    -- 6. blog_posts table
    CREATE TABLE IF NOT EXISTS blog_posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_published BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. inquiries table
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      read_status BOOLEAN DEFAULT FALSE,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. refresh_tokens table
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      token VARCHAR(255) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      revoked BOOLEAN DEFAULT FALSE
    );

    -- 9. Helper function and triggers for updating 'updated_at' columns automatically
    CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

    CREATE OR REPLACE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

    CREATE OR REPLACE TRIGGER update_blog_posts_updated_at
    BEFORE UPDATE ON blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
    ```

4. Create a .env file in the root directory and add your database credentials and JWT secret:
  
```
PG_USER=your_postgres_username
  PG_HOST=localhost
  PG_DATABASE=dev_showcase_db
  PG_PASSWORD=your_postgres_password
  PG_PORT=5432

  JWT_SECRET=a_very_strong_and_random_secret_key_for_jwt
  PORT=3000

```
  Replace placeholders with your actual credentials.

▌Running the Application

•  Development Mode:
  
```
bash
  npm run dev

```
  The server will run on http://localhost:3000 (or your specified PORT) and will restart automatically on code changes.

•  Production Mode:
  
```
bash
  npm start

```

▌API Endpoints

Once the server is running:

•  REST API Base URL: http://localhost:3000/api/v1
•  GraphQL Playground/Sandbox: http://localhost:3000/graphql

You can use tools like Postman (https://www.postman.com/) or Insomnia (https://insomnia.rest/) for testing REST endpoints, and the built-in GraphQL Playground for GraphQL queries and mutations.

▍Key REST Endpoints (Examples):
•  POST /api/v1/auth/register - User registration
•  POST /api/v1/auth/login - User login (returns access & refresh tokens)
•  GET /api/v1/users/:id - Get public user profile
•  PUT /api/v1/users/:id - Update authenticated user's own profile (requires JWT)
•  POST /api/v1/skills - Create master skill (Admin only, requires JWT)
•  POST /api/v1/user-skills - Add skill to user profile (requires JWT)
•  POST /api/v1/inquiries - Send inquiry to another user (requires JWT)

▍Key GraphQL Queries & Mutations (Examples in Playground):

Query a user's full profile with nested data:

```

query GetUserProfile($username: String!) {
 userProfile(username: $username) {
  id
  username
  email
  bio
  githubUrl
  projects {
   id
   name
   description
   techStack
  }
  skills {
   skill {
    name
   }
   proficiencyLevel
  }
  blogPosts {
   id
   title
   isPublished
  }
 }
}
# Query Variables: { "username": "your_username" }

**Create a project (Requires JWT in Authorization header: Bearer <token>):**
graphql
mutation CreateMyProject($input: ProjectInput!) {
 createProject(input: $input) {
  id
  name
  description
  user {
   username
  }
 }
}
# Query Variables: { "input": { "name": "My New Project", "description": "This is a great project.", "techStack": "React, Node" } }
  ```

▌Project Structure


```
├── config/         # Database connection and configuration
│  └── db.js
├── graphql/         # GraphQL schema, resolvers, and utility functions
│  ├── resolvers.js
│  ├── schema.js
│  └── utils/
│    └── authUtils.js   # GraphQL specific auth wrappers
├── middleware/       # Express middleware for REST API
│  ├── authenticateToken.js
│  ├── authorizeOwnership.js
│  ├── authorizeRole.js
│  ├── errorHandler.js
│  └── rateLimiters.js
├── routes/
│  └── v1/         # REST API version 1 routes
│    ├── auth.js     # Authentication (register, login, refresh, logout)
│    ├── blogPosts.js   # Blog posts (CRUD)
│    ├── inquiries.js   # Inquiries (send, receive, manage)
│    ├── projects.js   # Portfolio projects (CRUD)
│    ├── skills.js    # Master skills list (Admin CRUD)
│    ├── userSkills.js  # User-specific skills (CRUD)
│    └── users.js     # User profiles (Public read, Owner/Admin update/delete)
├── utils/          # Shared utility functions
│  └── tokenUtils.js    # JWT token utilities
├── .env           # Environment variables (local, NOT committed to Git)
├── .gitignore
├── package.json
├── server.js        # Main application entry point (Express setup, API mounting)
└── README.md
```

▌Contributing

Feel free to fork the repository and contribute! Please open an issue first to discuss what you would like to change.

▌License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

▌Contact

Ekram Asrar - https://www.linkedin.com/in/ekram-a-835057294/ - ekramasrar94@gmail.com
Project Link: https://github.com/Ekram2004/dev-showcase-api

```
