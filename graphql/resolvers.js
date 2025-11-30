const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { GraphQLError } = require("graphql");
const { query } = require("../config/db");
const { generateRefreshToken } = require("../utils/tokenUtils");
const ms = require("ms");

const {
  DataScalar,
  authenticated,
  authorized,
  ownerOf,
} = require("./utils/authUtils");

const accessTokenExpiresIn = "15m";
const refreshTokenExpiresIn = "7d";

const resolvers = {
  Date: DataScalar,
  ProficiencyLevel: {
    beginner: "beginner",
    intermediate: "intermediate",
    expert: "expert",
  },

  Query: {
    users: async () => {
      const res = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.id ASC",
      );
      return res.rows;
    },
    user: async (parent, { id }) => {
      const res = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id=r.id WHERE u.id = $1",
        [id],
      );
      return res.rows[0];
    },
    userProfile: async (parent, { username }) => {
      const res = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1",
        [username],
      );
      return res.rows[0];
    },

    projects: async () => {
      const res = await query(
        "SELECT * FROM projects ORDER BY created_at DESC",
      );
      return res.rows;
    },
    project: async (parent, { id }) => {
      const res = await query("SELECT * FROM projects WHERE id = $1", [id]);
      return res.rows[0];
    },
    userProjects: async (parent, { userId }) => {
      const res = await query(
        "SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
      );
      return res.rows;
    },

    blogPosts: async () => {
      const res = await query(
        "SELECT * FROM blog_posts WHERE is_published = TRUE ORDER BY created_at DESC",
      );
      return res.rows;
    },
    blogPost: async (parent, { id }) => {
      const res = await query(
        "SELECT * FROM blog_posts WHERE id = $1 AND is_published = TRUE",
        [id],
      );
    },
    userBlogPosts: async (parent, { userId }) => {
      const res = await query(
        "SELECT * FROM blog_posts WHERE user_id = $1 AND is_published = TRUE ORDER BY created_at DESC",
        [userId],
      );
      return res.rows;
    },
    skills: async () => {
      const res = await query("SELECT * FROM skills ORDER BY name ASC");
      return res.rows;
    },
    skill: async (parent, { id }) => {
      const res = await query("SELECT * FROM skills WHERE id = $1", [id]);
      return res.rows[0];
    },

    myProfile: authenticated(async (parent, args, context) => {
      const res = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
        [context.user.userId],
      );
      return res.rows[0];
    }),
    myProjects: authenticated(async (parent, args, context) => {
      const res = await query(
        "SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC",
        [context.user.userId],
      );
      return res.rows;
    }),
    myBlogPosts: authenticated(async (parent, args, context) => {
      const res = await query(
        "SELECT * FROM blog_posts WHERE user_id = $1 ORDER BY created_at DESC",
        [context.user.userId],
      );
      return res.rows;
    }),
    mySkills: authenticated(async (parent, args, context) => {
      const res = await query(
        `SELECT us.user_id, us.skill_id, s.name AS skill_name, us.proficiency_level FROM user_skills us JOIN skills s ON us.skill_id = s.id WHERE us.user_id = $1 ORDER BY s.name ASC`,
        [context.user.userId],
      );

      return res.rows.map((row) => ({
        user: { id: row.user_id },
        skill: { id: row.skill_id, name: row.skill_name },
        proficiencyLevel: row.proficiency_level,
      }));
    }),

    myInquiriesReceived: authenticated(async (parent, args, context) => {
      const res = await query(
        `SELECT i.* FROM inquiries i WHERE i.receiver_id = $1 ORDER BY i.sent_at DESC`,
        [context.user.userId],
      );
      return res.rows;
    }),
    myInquiriesSent: authenticated(async (parent, args, context) => {
      const res = await query(
        `SELECT i.* FROM inquiries i WHERE i.sender_id = $1 ORDER BY i.sent_st DESC`,
        [context.user.userId],
      );
      return res.rows;
    }),
  },

  Mutation: {
    register: async (parent, { input }) => {
      const { username, email, password } = input;
      const existingUser = await query(
        "SELECT id FROM users WHERE username = $1 OR email = $2",
        [username, email],
      );
      if (existingUser.rows.length > 0) {
        throw new GraphQLError("Username or email already exists.", {
          extensions: { code: "CONFLICT" },
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const roleRes = await query("SELECT id FROM roles WHERE name = $1", [
        "user",
      ]);
      const userRoleId = roleRes.rows[0].id;

      const newUser = await query(
        "INSERT INTO users (username, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id, username, email, created_at ",
        [username, email, passwordHash, userRoleId],
      );

      const userWithRole = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
        [newUser.rows[0].id],
      );
      return userWithRole.rows[0];
    },

    login: async (parent, { input }) => {
      const { email, password } = input;
      const userRes = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.email = $1",
        [email],
      );
      const user = userRes.rows[0];
      if (!user) {
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }
      const accessTokenPayload = {
        userId: user.id,
        username: user.username,
        roles: [user.role_name],
      };
      const accessToken = jwt.sign(accessTokenPayload, process.env.JWT_SECRET, {
        expiresIn: accessTokenExpiresIn,
      });
      const refreshToken = generateRefreshToken();
      const refreshExpiresAt = new Date(Date.now() + ms(refreshTokenExpiresIn));
      await query(
        "INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)",
        [refreshToken, user.id, refreshExpiresAt],
      );
      return {
        accessToken,
        refreshToken,
        user: { ...user, role: { id: user.role_id, name: user.role_name } },
      };
    },
    updateMyProfile: authenticated(
      ownerOf(
        "users",
        "id",
        "id",
      )(async (parent, { input }, context) => {
        const userId = context.user.userId;
        const fields = [];
        const params = [userId];

        let paramIndex = 2;
        if (input.username !== undefined) {
          const existingUser = await query(
            "SELECT id FROM users WHERE username = $1 AND id != $2",
            [input.username, userId],
          );
          if (existingUser.rows.length > 0)
            throw new GraphQLError("Username already taken.", {
              extensions: { code: "CONFLICT" },
            });
          fields.push(`username = $${paramIndex++}`);
          params.push(input.username);
        }
        if (input.email !== undefined) {
          const existingUser = await query(
            "SELECT id FROM users WHERE email = $1 AND id != $2",
            [input.email, userId],
          );
          if (existingUser.rows.length > 0)
            throw new GraphQLError("Email already taken.", {
              extensions: { code: "CONFLICT" },
            });
          fields.push(`email = $${paramIndex++}`);
          params.push(input.email);
        }
        if (input.password !== undefined && input.password !== "") {
          const passwordHash = await bcrypt.hash(input.password, 10);
          fields.push(`password_hash = $${paramIndex++}`);
          params.push(passwordHash);
        }
        if (input.bio !== undefined) {
          fields.push(`bio = $${paramIndex++}`);
          params.push(input.bio);
        }
        if (input.githubUrl !== undefined) {
          fields.push(`github_url = $${paramIndex++}`);
          params.push(input.githubUrl);
        }
        if (input.linkedinUrl !== undefined) {
          fields.push(`linkedin_url = $${paramIndex++}`);
          params.push(input.linkedinUrl);
        }
        if (input.portfolioUrl !== undefined) {
          fields.push(`portfolio_url = $${paramIndex++}`);
          params.push(input.portfolioUrl);
        }
        if (input.profilePictureUrl !== undefined) {
          fields.push(`profile_picture_url = $${paramIndex++}`);
          params.push(input.profilePictureUrl);
        }
        if (fields.length === 0) {
          const currentRes = await query(
            "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
            [userId],
          );
          return currentRes.rows[0];
        }

        const setClause = fields.join(", ");
        await query(`UPDATE users SET ${setClause} WHERE id = $1`, params);
        const updatedUser = await query(
          "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
          [userId],
        );
        return updatedUser.rows[0];
      }),
    ),
    deleteMyAccount: authenticated(
      ownerOf(
        "users",
        "id",
        "id",
      )(async (parent, args, context) => {
        const userId = context.user.userId;
        const res = await query(
          "DELETE FROM users WHERE id = $1 RETURNING id",
          [userId],
        );
        return res.rows.length > 0;
      }),
    ),

    createProject: authenticated(async (parent, { input }, context) => {
      const {
        name,
        description,
        techStack,
        projectUrl,
        githubRepoUrl,
        imageUrl,
      } = input;
      const userId = context.user.userId;
      const res = await query(
        "INSERT INTO projects (user_id, name, description, tech_stack, project_url, github_repo_url, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [
          userId,
          name,
          description,
          techStack,
          projectUrl,
          githubRepoUrl,
          imageUrl,
        ],
      );
      return res.rows[0];
    }),
    updateProject: authenticated(
      ownerOf(
        "projects",
        "user_id",
        "id",
      )(async (parent, { id, input }, context) => {
        const fields = ["updated_at = NOW()"];
        const params = [id];
        let paramIndex = 2;

        if (input.name !== undefined) {
          fields.push(`name = $${paramIndex++}`);
          params.push(input.name);
        }
        if (input.description !== undefined) {
          fields.push(`description = $${paramIndex++}`);
          params.push(input.description);
        }
        if (input.techStack !== undefined) {
          fields.push(`tech_stack = $${paramIndex++}`);
          params.push(input.techStack);
        }
        if (input.projectUrl !== undefined) {
          fields.push(`project_url = $${paramIndex++}`);
          params.push(input.projectUrl);
        }
        if (input.githubRepoUrl !== undefined) {
          fields.push(`github_repo_url = $${paramIndex++}`);
          params.push(input.githubRepoUrl);
        }
        if (input.imageUrl !== undefined) {
          fields.push(`image_url = $${paramIndex++}`);
          params.push(input.imageUrl);
        }

        if (fields.length === 1 && fields[0] === "updated_at = NOW()") {
          const currentRes = await query(
            "SELECT * FROM projects WHERE id = $1",
            [id],
          );
          return currentRes.rows[0];
        }

        const setClause = fields.join(", ");
        const res = await query(
          `UPDATE projects SET ${setClause} WHERE id = $1 RETURNING *`,
          params,
        );
        return res.rows[0];
      }),
    ),
    deleteProject: authenticated(
      ownerOf(
        "projects",
        "user_id",
        "id",
      )(async (parent, { id }, context) => {
        const res = await query(
          "DELETE FROM projects WHERE id = $1 RETURNING id",
          [id],
        );
        return res.rows.length > 0;
      }),
    ),
    createBlogPost: authenticated(async (parent, { input }, context) => {
      const { title, content, isPublished = false } = input;
      const userId = context.user.userId;
      const res = await query(
        "INSERT INTO blog_posts (user_id, title, content, is_published) VALUES ($1, $2, $3, $4) RETURNING *",
        [userId, title, content, isPublished],
      );
      return res.rows[0];
    }),
    updateBlogPost: authenticated(
      ownerOf(
        "blog_posts",
        "user_id",
        "id",
      )(async (parent, { id, input }, context) => {
        const fields = ["updated_at = NOW()"];
        const params = [id];
        let paramIndex = 2;

        if (input.title !== undefined) {
          fields.push(`title = $${paramIndex++}`);
          params.push(input.title);
        }
        if (input.content !== undefined) {
          fields.push(`content = $${paramIndex++}`);
          params.push(input.content);
        }
        if (input.isPublished !== undefined) {
          fields.push(`is_published = $${paramIndex++}`);
          params.push(input.isPublished);
        }

        if (fields.length === 1 && fields[0] === "updated_at = NOW()") {
          const currentRes = await query(
            "SELECT * FROM blog_posts WHERE id = $1",
            [id],
          );
          return currentRes.rows[0];
        }

        const setClause = fields.join(", ");
        const res = await query(
          `UPDATE blog_posts SET ${setClause} WHERE id = $1 RETURNING *`,
          params,
        );
        return res.rows[0];
      }),
    ),
    deleteBlogPost: authenticated(
      ownerOf(
        "blog_posts",
        "user_id",
        "id",
      )(async (parent, { id }, context) => {
        const res = await query(
          "DELETE FROM blog_posts WHERE id = $1 RETURNING id",
          [id],
        );
        return res.rows.length > 0;
      }),
    ),
    addSkillToProfile: authenticated(
      async (
        parent,
        { skillId, proficiencyLevel = "intermediate" },
        context,
      ) => {
        const userId = context.user.userId;
        // Validate skillId exists
        const skillExists = await query("SELECT id FROM skills WHERE id = $1", [
          skillId,
        ]);
        if (skillExists.rows.length === 0) {
          throw new GraphQLError("Provided skill ID does not exist.", {
            extensions: { code: "BAD_REQUEST" },
          });
        }
        // Check if user already has this skill
        const existingUserSkill = await query(
          "SELECT user_id FROM user_skills WHERE user_id = $1 AND skill_id = $2",
          [userId, skillId],
        );
        if (existingUserSkill.rows.length > 0) {
          throw new GraphQLError(
            "User already has this skill. Use updateSkillProficiency.",
            { extensions: { code: "CONFLICT" } },
          );
        }

        const newUserSkill = await query(
          "INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES ($1, $2, $3) RETURNING user_id, skill_id, proficiency_level",
          [userId, skillId, proficiencyLevel],
        );
        // Return structured as UserSkill type expects
        return {
          user: { id: newUserSkill.rows[0].user_id },
          skill: { id: newUserSkill.rows[0].skill_id },
          proficiencyLevel: newUserSkill.rows[0].proficiency_level,
        };
      },
    ),
    updateSkillProficiency: authenticated(
      async (parent, { skillId, proficiencyLevel }, context) => {
        const userId = context.user.userId;
        const updatedUserSkill = await query(
          "UPDATE user_skills SET proficiency_level = $1 WHERE user_id = $2 AND skill_id = $3 RETURNING user_id, skill_id, proficiency_level",
          [proficiencyLevel, userId, skillId],
        );
        if (updatedUserSkill.rows.length === 0) {
          throw new GraphQLError("User skill not found or not owned by user.", {
            extensions: { code: "NOT_FOUND" },
          });
        }
        return {
          user: { id: updatedUserSkill.rows[0].user_id },
          skill: { id: updatedUserSkill.rows[0].skill_id },
          proficiencyLevel: updatedUserSkill.rows[0].proficiency_level,
        };
      },
    ),
    removeSkillFromProfile: authenticated(
      async (parent, { skillId }, context) => {
        const userId = context.user.userId;
        const res = await query(
          "DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2 RETURNING user_id",
          [userId, skillId],
        );
        return res.rows.length > 0;
      },
    ),
    sendInquiry: authenticated(
      async (parent, { receiverId, subject, message }, context) => {
        const senderId = context.user.userId;
        if (senderId === receiverId) {
          throw new GraphQLError("Cannot send an inquiry to yourself.", {
            extensions: { code: "BAD_REQUEST" },
          });
        }
        const receiverExists = await query(
          "SELECT id FROM users WHERE id = $1",
          [receiverId],
        );
        if (receiverExists.rows.length === 0) {
          throw new GraphQLError("Receiver user not found.", {
            extensions: { code: "BAD_REQUEST" },
          });
        }
        const newInquiry = await query(
          "INSERT INTO inquiries (sender_id, receiver_id, subject, message) VALUES ($1, $2, $3, $4) RETURNING *",
          [senderId, receiverId, subject, message],
        );
        return newInquiry.rows[0];
      },
    ),
    markInquiryRead: authenticated(
      ownerOf(
        "inquiries",
        "receiver_id",
        "id",
      )(async (parent, { id, readStatus }, context) => {
        const updatedInquiry = await query(
          "UPDATE inquiries SET read_status = $1 WHERE id = $2 RETURNING *",
          [readStatus, id],
        );
        if (updatedInquiry.rows.length === 0) {
          throw new GraphQLError("Inquiry not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }
        return updatedInquiry.rows[0];
      }),
    ),
    deleteInquiry: authenticated(
      ownerOf(
        "inquiries",
        "receiver_id",
        "id",
      )(async (parent, { id }, context) => {
        const res = await query(
          "DELETE FROM inquiries WHERE id = $1 RETURNING id",
          [id],
        );
        return res.rows.length > 0;
      }),
    ),
  },

  User: {
    role: async (parent, args, context) => {
      // If role_name is already selected in parent, use it directly
      if (parent.role_name) {
        return { id: parent.role_id, name: parent.role_name };
      }
      const res = await query("SELECT id, name FROM roles WHERE id = $1", [
        parent.role_id,
      ]);
      return res.rows[0];
    },
    projects: async (parent, args, context) => {
      const res = await query(
        "SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC",
        [parent.id],
      );
      return res.rows;
    },
    skills: async (parent, args, context) => {
      const res = await query(
        `SELECT us.user_id, us.skill_id, s.name AS skill_name, us.proficiency_level
           FROM user_skills us
           JOIN skills s ON us.skill_id = s.id
           WHERE us.user_id = $1
           ORDER BY s.name ASC`,
        [parent.id],
      );
      // Map to UserSkill type structure for nested resolution
      return res.rows.map((row) => ({
        user: { id: row.user_id },
        skill: { id: row.skill_id, name: row.skill_name },
        proficiencyLevel: row.proficiency_level,
      }));
    },
    blogPosts: async (parent, args, context) => {
      const res = await query(
        "SELECT * FROM blog_posts WHERE user_id = $1 AND is_published = TRUE ORDER BY created_at DESC",
        [parent.id],
      );
      return res.rows;
    },
    inquiriesReceived: authenticated(async (parent, args, context) => {
      // Only allow a user to see their own received inquiries if authenticated and requesting their own profile
      if (context.user && context.user.userId === parent.id) {
        const res = await query(
          "SELECT * FROM inquiries WHERE receiver_id = $1 ORDER BY sent_at DESC",
          [parent.id],
        );
        return res.rows;
      }
      return [];
    }),
    inquiriesSent: authenticated(async (parent, args, context) => {
      // Only allow a user to see their own sent inquiries if authenticated and requesting their own profile
      if (context.user && context.user.userId === parent.id) {
        const res = await query(
          "SELECT * FROM inquiries WHERE sender_id = $1 ORDER BY sent_at DESC",
          [parent.id],
        );
        return res.rows;
      }
      return [];
    }),
  },

  Project: {
    user: async (parent, args, context) => {
      const res = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
        [parent.user_id],
      );
      return res.rows[0];
    },
  },

  BlogPost: {
    user: async (parent, args, context) => {
      const res = await query(
        "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
        [parent.user_id],
      );
      return res.rows[0];
    },
  },

  UserSkill: {
    user: async (parent, args, context) => {
      if (parent.user && parent.user.id) {
        const res = await query(
          "SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
          [parent.user.id],
        );
        return res.rows[0];
      }
      return null; // Should not happen if `mySkills` query maps correctly
    },
    skill: async (parent, args, context) => {
      if (parent.skill && parent.skill.id) {
        const res = await query("SELECT id, name FROM skills WHERE id = $1", [
          parent.skill.id,
        ]);
        return res.rows[0];
      }
      return null; // Should not happen
    },
  },

  Inquiry: {
    sender: async (parent, args, context) => {
      if (!parent.sender_id) return null; // If sender_id is null, return null user
      const res = await query(
        "SELECT u.id, u.username, u.email, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
        [parent.sender_id],
      );
      return res.rows[0];
    },
    receiver: async (parent, args, context) => {
      const res = await query(
        "SELECT u.id, u.username, u.email, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1",
        [parent.receiver_id],
      );
      return res.rows[0];
    },
  },
};

module.exports = resolvers;
