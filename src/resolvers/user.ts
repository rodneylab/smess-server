import { Arg, Ctx, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import User, { UserLoginType } from '../entities/User';
import type { Session } from '@supabase/supabase-js';
import type { Context } from '../context';
import {
  githubLogin,
  githubRegistrationPermitted,
  gqlUser,
  signInWithEmail,
  signUpWithEmail,
  validEmail,
  validLoginUsername,
  validUsername,
} from '../utilities/user';
import RegisterInput from './RegisterInput';
import { LoginType } from '.pnpm/@prisma+client@3.0.2_prisma@3.0.2/node_modules/.prisma/client';

@ObjectType()
class FieldError {
  @Field()
  field: string;

  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;

  @Field(() => User, { nullable: true })
  session?: Session;
}

@Resolver(User)
export class UserResolver {
  @Query(() => User, { nullable: true })
  me(@Ctx() { req, prisma }: Context) {
    if (!req.session.userId) {
      return null;
    }
    return prisma.user.findUnique({ where: { uid: req.session.userId } });
  }

  @Mutation(() => UserResponse)
  async githubLogin(
    @Arg('accessToken') accessToken: string, // this is the GitHub access token (not supabase)
    @Arg('refreshToken') refreshToken: string,
    @Ctx() { req, prisma, supabase }: Context,
  ): Promise<UserResponse> {
    const { user, session, error } = await githubLogin(supabase, accessToken, refreshToken);
    if (!user || !session) {
      return {
        errors: [
          {
            field: 'githubAccount',
            message: 'Invalid user',
          },
        ],
      };
    }
    const { user_metadata } = user;
    let dbUser = await prisma.user.findFirst({
      where: { username: user_metadata.user_name, loginType: LoginType.GITHUB },
    });
    if (!dbUser) {
      if (!githubRegistrationPermitted) {
        return {
          errors: [
            {
              field: 'githubAccount',
              message: 'Not currently registered',
            },
          ],
        };
      }

      const { email, id } = user;
      if (!email) {
        return {
          errors: [
            {
              field: 'githubAccount',
              message: 'Server error: email missing',
            },
          ],
        };
      }
      const dbUser = await prisma.user.create({
        data: {
          userId: id,
          email,
          username: user_metadata.user_name,
          loginType: LoginType.GITHUB,
        },
      });
      return { ...gqlUser(dbUser), session };
    }
    if (error || !user || !session) {
      return {
        errors: [{ field: 'githubAccount', message: error?.message ?? '' }],
      };
    }
    const { uid } = dbUser;
    req.session.userId = uid;
    return { ...gqlUser(dbUser), session };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg('username') username: string,
    @Arg('password') password: string,
    @Ctx() { req, prisma, supabase }: Context,
  ): Promise<UserResponse> {
    const { errors: usernameErrors } = await validLoginUsername(username);
    if (usernameErrors) {
      return { errors: usernameErrors };
    }
    const dbUser = await prisma.user.findFirst({
      where: { username, loginType: LoginType.EMAIL },
    });
    const loginErrors = [
      {
        field: 'username',
        message: 'Please check username/email.',
      },
      {
        field: 'password',
        message: 'Please check username/password.',
      },
    ];
    if (!dbUser) {
      return {
        errors: loginErrors,
      };
    }
    const { email, uid } = dbUser;
    const { user, session, error } = await signInWithEmail(supabase, email, password);
    if (error || !user || !session) {
      console.log('supabase login error: ', error?.message);
      return {
        errors: loginErrors,
      };
    }
    req.session.userId = uid;
    return { ...gqlUser(dbUser), session };
  }

  @Mutation(() => Boolean)
  logout(@Ctx() { req }: Context) {
    const { session } = req;
    const next = () => {};
    req.sessionStore.destroy(session.sessionId, next);
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg('options') options: RegisterInput,
    @Ctx() { prisma, supabase }: Context,
  ): Promise<UserResponse> {
    const { email, password, username } = options;

    const { errors: emailErrors } = await validEmail(email, prisma);
    if (emailErrors) {
      return { errors: emailErrors };
    }

    const { errors: usernameErrors } = await validUsername(username, UserLoginType.EMAIL, prisma);
    if (usernameErrors) {
      return { errors: usernameErrors };
    }

    const { user, error } = await signUpWithEmail(supabase, email, password);
    if (error || !user) {
      return {
        errors: [{ field: 'password', message: error?.message ?? '' }],
      };
    }
    const { id: userId } = user;
    const dbUser = await prisma.user.create({
      data: {
        userId,
        email,
        username,
        loginType: LoginType.EMAIL,
      },
    });
    return { ...gqlUser(dbUser) };
  }
}

export { UserResolver as default };
