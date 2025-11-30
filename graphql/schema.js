const { gql } = require("apollo-server-express");

const typeDefs = gql`
  scalar Date

  enum ProficiencyLevel {
    beginner
    intermediate
    expert
  }

  type Role {
    id: ID!
    name: String!
  }
  type User {
    id: ID!
    username: String!
    email: String!
    bio: String
    githubUrl: String
    linkedinUrl: String
    portfolioUrl: String
    profilePictureUrl: String
    role: Role! # Joined role
    createdAt: Date!
    updatedAt: Date!
    projects: [Project!]!
    skills: [UserSkill!]!
    blogPosts: [BlogPost!]!
    inquiriesReceived: [Inquiry!]!
    inquiriesSent: [Inquiry!]!
  }

  type Project {
    id: ID!
    user: User!
    name: String!
    description: String
    techStack: String
    projectUrl: String
    githubRepoUrl: String
    imageUrl: String
    createdAt: Date!
    updatedAt: Date!
  }
  type Skill {
    id: ID!
    name: String!
  }
  type UserSkill {
    user: User!
    skill: Skill!
    proficiencyLevel: ProficiencyLevel!
  }
  type BlogPost {
    id: ID!
    user: User!
    title: String!
    content: String!
    isPublished: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }
  type Inquiry {
    id: ID!
    sender: User
    receiver: User!
    subject: String!
    message: String!
    readStatus: Boolean!
    sentAt: Date!
  }
  # --- Inputs ---

  input RegisterInput {
    username: String!
    email: String!
    password: String!
  }
  input LoginInput {
    email: String!
    password: String!
  }
  input UserUpdateInput {
    username: String
    email: String
    password: String
    bio: String
    githubUrl: String
    linkedinUrl: String
    portfolioUrl: String
    profilePictureUrl: String
    roleId: ID
  }
  input ProjectInput {
    name: String!
    description: String
    techStack: String
    projectUrl: String
    githubRepoUrl: String
    imageUrl: String
  }
  input ProjectUpdateInput {
    name: String
    description: String
    techStack: String
    projectUrl: String
    githubRepoUrl: String
    imageUrl: String
  }
  input BlogPostInput {
    title: String!
    content: String!
    isPublished: Boolean
  }
  input BlogPostUpdateInput {
    title: String
    content: String
    isPublished: Boolean
  }
  # --- Auth Payload ---
  type AuthPayload {
    accessToken: String!
    refreshTokenn: String!
    user: User!
  }
  # --- Queries ---
  type Query {
    users: [User!]!
    user(id: ID): User
    userProfile(username: String!): User

    projects: [Project!]!
    project(id: ID!): Project
    userProjects(userId: ID!): [Project!]!

    blogPosts: [BlogPost!]!
    blogPost(id: ID!): BlogPost
    userBlogPosts(userId: ID!): [BlogPost!]!

    skills: [Skill!]!
    skill(id: ID!): Skill
    # Authenticated Queries (already handled by REST, but can be duplicated here for GraphQL specific clients)
    myProfile: User
    myProjects: [Project!]!
    myBlogPosts: [BlogPost!]!
    mySkills: [UserSkill!]!
    myInquiriesReceived: [Inquiry!]!
    myInquiriesSent: [Inquiry!]!
  }
  # --- Mutations ---
  type Mutation {
    # Auth
    register(input: RegisterInput!): User!
    login(input: LoginInput!): AuthPayload!

    # User Profile (GraphQL handles updates, REST for Admin role changes)
    updateMyProfile(input: UserUpdateInput!): User!
    deleteMyAccount: Boolean!

    # Project Management (Owned by current user)
    createProject(input: ProjectInput!): Project!
    updateProject(id: ID!, input: ProjectUpdateInput!): Project!
    deleteProject(id: ID!): Boolean!

    # Blog Post Management (Owned by current user)
    createBlogPost(input: BlogPostInput!): BlogPost!
    updateBlogPost(id: ID!, input: BlogPostUpdateInput!): BlogPost!
    deleteBlogPost(id: ID!): Boolean!

    # User Skills (Owned by current user)
    addSkillToProfile(
      skillId: ID!
      proficiencyLevel: ProficiencyLevel
    ): UserSkill!
    updateSkillProficiency(
      skillId: ID!
      proficiencyLevel: ProficiencyLevel!
    ): UserSkill!
    removeSkillFromProfile(skillId: ID!): Boolean!

    # Inquiry (Send from current user)
    sendInquiry(receiverId: ID!, subject: String!, message: String!): Inquiry!
    # Mark as read/delete (current user is receiver)
    markInquiryRead(id: ID!, readStatus: Boolean!): Inquiry!
    deleteInquiry(id: ID!): Boolean!
  }
`;

module.exports = typeDefs;
