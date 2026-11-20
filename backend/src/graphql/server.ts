/**
 * Apollo Server v4 setup for StellarKraal GraphQL API v2 (ADR-011).
 *
 * Mounts the GraphQL endpoint at /api/v2/graphql (closes #1537).
 * Also keeps the legacy /graphql path for backward compatibility.
 *
 * Key features:
 * - Schema-first SDL (typeDefs + resolvers)
 * - JWT authentication context — userPublicKey extracted for every request
 * - Per-request DataLoader instances to prevent N+1 queries on User/Loan joins
 * - Apollo Sandbox in non-production environments for interactive exploration
 *
 * Usage:
 *   const { middleware, server } = await createGraphQLMiddleware();
 *   app.use('/api/v2/graphql', cors(), express.json(), middleware);
 *   app.use('/graphql', cors(), express.json(), middleware); // legacy path
 *   // Call server.stop() during graceful shutdown.
 */
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './typeDefs';
import { resolvers, createLoaders, type RequestLoaders } from './resolvers';

export interface GraphQLContext {
  /** The authenticated user's public key, if a JWT was presented. */
  userPublicKey?: string;
  /** Per-request DataLoader instances for batched DB lookups. */
  loaders: RequestLoaders;
}

/**
 * Build and start an Apollo Server instance, returning an Express middleware
 * and a reference to the server for graceful shutdown.
 *
 * @returns `{ middleware, server }` — mount `middleware` on an Express route.
 */
export async function createGraphQLMiddleware(): Promise<{
  middleware: ReturnType<typeof expressMiddleware<GraphQLContext>>;
  server: ApolloServer<GraphQLContext>;
}> {
  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    // Disable introspection in production to reduce attack surface.
    introspection: process.env.NODE_ENV !== 'production',
  });

  await server.start();

  const middleware = expressMiddleware(server, {
    context: async ({ req }) => {
      // Forward the authenticated user from JWT middleware if present.
      const user = (req as any).user as { publicKey?: string } | undefined;
      return {
        userPublicKey: user?.publicKey,
        // Fresh DataLoader instances per request so batching is scoped
        // to a single operation and caches don't bleed across requests.
        loaders: createLoaders(),
      };
    },
  });

  return { middleware, server };
}
