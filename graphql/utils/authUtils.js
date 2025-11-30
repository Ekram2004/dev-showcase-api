const { GraphQLError, GraphQLScalarType, Kind } = require("graphql");
const { query } = require("../../config/db");

const DataScalar = new GraphQLScalarType({
  name: "Date",
  description: "Date custom scalar type",
  serialize(value) {
    return value.toIoString();
  },
  parseValue(value) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

const authenticated = (resolver) => (parent, args, context, info) => {
  if (!context.user) {
    throw new GraphQLError("Authentication required.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return resolver(parent, args, context, info);
};

const authorized =
  (roles = []) =>
  (resolver) =>
  (parent, args, context, info) => {
    if (!context.user) {
      throw new GraphQLError("Authentication required.", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }
    const userRoles = context.user.roles || [];
    const hasPermission = roles.some((role) => userRoles.includes(role));
    if (!hasPermission) {
      throw new GraphQLError("You are not authorized to perform this action.", {
        extensions: { code: "FORBIDDEN", requiredRoles: roles },
      });
    }
    return resolver(parent, args, context, info);
  };

const ownerOf =
  (resourceTable, ownerColumn = "user_id", idParam = "id") =>
  (resolver) =>
  async (parent, args, context, info) => {
    if (!context.user) {
      throw new GraphQLError("Authentication required", {
        extensions: { code: "UNAUTHENTICATED" },
      });
    }

    const resourceId = args[idParam] || parent[idParam];
    if (!resourceId) {
      throw new GraphQLError(`Resource ID not provided for ${resourceTable}.`, {
        extensions: { code: "BAD_REQUEST" },
      });
    }

    const result = await query(
      `SELECT ${ownerColumn} FROM ${resourceTable} WHERE id = $1`,
      [resourceId],
    );

    const resource = result.rows[0];
    if (!resource) {
      throw new GraphQLError(
        `${resourceTable.charAt(0).toUpperCase() + resourceTable.slice(1)} not found`,
        {
          extensions: { code: "NOT_FOUND" },
        },
      );
    }
    const isOwner = resource[ownerColumn] === context.user.userId;
    const isAdmin = context.user.roles && context.user.roles.includes("admin");

    if (!isOwner && !isAdmin) {
      throw new GraphQLError(
        "You are not authorized to modify this resource.",
        {
          extensions: { code: "FORBIDDEN" },
        },
      );
    }
    return resolver(parent, args, context, info);
  };

module.exports = {
  DataScalar,
  authenticated,
  authorized,
  ownerOf,
};
