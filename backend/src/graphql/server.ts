/**
 * Apollo Server v4 setup for StellarKraal GraphQL PoC (ADR-009).
 *
 * Creates an Apollo Server instance and returns an Express-compatible
 * middleware using expressMiddleware from @apollo/server/express4.
 *
 * Usage:
 *   const { middleware, server } = await createGraphQLMiddleware();
 *   app.use('/graphql', cors(), express.json(), middleware);
 *   // Call server.stop() during graceful shutdown.
 *
 * The GraphQL endpoint lives at /graphql and includes the Apollo Sandbox
 * in non-production environments for interactive exploration.
 */
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './typeDefs';
import { resolvers } from './resolvers';

export interface GraphQLContext {
  /** The authenticated user's public key, if a JWT was presented. */
  userPublicKey?: string;
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
      return { userPublicKey: user?.publicKey };
    },
  });

  return { middleware, server };
}
