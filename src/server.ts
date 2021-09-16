import fastifySession from '@fastify/session';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import { ApolloServer } from 'apollo-server-fastify';
import { ApolloServerPlugin } from 'apollo-server-plugin-base';
import 'dotenv/config';
import Fastify, { FastifyInstance, RouteShorthandOptions } from 'fastify';
import fastifyCookie from 'fastify-cookie';
// import { Server, IncomingMessage, ServerResponse  } from 'http';
// import fastifyCors from 'fastify-cors';
import fastifyPostgres from 'fastify-postgres';
import fastifyRedis from 'fastify-redis';
import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
import HelloResolver from './resolvers/hello';
import UserResolver from './resolvers/user';
import { PrismaClient } from '.prisma/client';
import { createClient } from '@supabase/supabase-js';
import { COOKIE_NAME } from './constants';
import { isProduction } from './utilities/utilities';

function fastifyAppClosePlugin(app: FastifyInstance): ApolloServerPlugin {
  return {
    async serverWillStart() {
      return {
        async drainServer() {
          await app.close();
        },
      };
    },
  };
}

async function startApolloServer() {
  const server: FastifyInstance = Fastify({});

  // server.register(fastifyCors, {
  //   origin: process.env.CORS_ORIGIN,
  //   methods: ['GET', 'POST'],
  //   credentials: true,
  // });
  server.register(fastifyPostgres, {
    connectionString: process.env.DATABASE_URL,
  });
  server.register(fastifyCookie);
  server.register(fastifyRedis, { host: '127.0.0.1' });
  const { redis } = server;
  server.register(fastifySession, {
    secret: process.env.SESSION_SECRET as string,
    cookieName: COOKIE_NAME as string,
    cookie: {
      maxAge: 604_800_000, // 1000 * 3600 * 24 * 7 (1 week)
      secure: isProduction,
      sameSite: 'Lax',
      domain: isProduction ? `.${process.env.DOMAIN}` : undefined,
    },
    saveUninitialized: false
  });
  // server.register(prismaPlugin);

  const opts: RouteShorthandOptions = {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            pong: {
              type: 'string',
            },
          },
        },
      },
    },
  };

  server.get('/ping', opts, async (_request, _reply) => {
    return { pong: 'it worked!' };
  });

  const prisma = new PrismaClient();
  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_KEY as string,
  );

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [HelloResolver, UserResolver],
      validate: false,
    }),
    plugins: [
      fastifyAppClosePlugin(server),
      ApolloServerPluginDrainHttpServer({ httpServer: server.server }),
    ],
    context: ({ req, res }) => ({
      req,
      res,
      prisma,
      redis,
      supabase,
    }),
  });
  await apolloServer.start();
  server.register(apolloServer.createHandler());
  await server.listen(4000);
  console.log(`Server ready at
  http://localhost:4000${apolloServer.graphqlPath}`);
  // }
  // const server: FastifyInstance = Fastify({});

  // const start = async () => {
  //   try {
  //     await server.listen(4000);

  //     // const address = server.server.address();
  //     // const port = typeof address === 'string' ? address : address?.port;
  //   } catch (error) {
  //     server.log.error(error);
  //     process.exit(1);
  //   }
  // };
}

startApolloServer();
