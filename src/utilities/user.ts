import { LoginType, User as DBUser } from '.prisma/client';
import type { PrismaClient } from '.prisma/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserLoginType } from '../entities/User';
import axios from 'axios';

const emailRegex =
  /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export async function githubLogin(
  supabase: SupabaseClient,
  accessToken: string,
  refreshToken: string,
) {
  try {
    const response = await axios({
      url: 'https://api.github.com/user',
      method: 'GET',
      headers: {
        Authorization: `token ${accessToken}`,
      },
    });
    const { login } = response.data;

    const { user, session, error } = await supabase.auth.signIn({
      refreshToken,
    });
    return { login, user, session, error };
  } catch (error) {
    let message;
    if (error.response) {
      message = `Storage server responded with non 2xx code: ${error.response.data}`;
    } else if (error.request) {
      message = `No storage response received: ${error.request}`;
    } else {
      message = `Error setting up storage response: ${error.message}`;
    }
    return { error: { message } };
  }
}

export function githubRegistrationPermitted() {
  return process.env.ALLOW_GITHUB_REGISTRATION === 'true';
}

export function gqlUser(user: DBUser) {
  const { loginType } = user;

  const gqlLoginType = userLogin(loginType);
  if (!gqlLoginType) {
    return {
      errors: [{ field: 'loginType', message: 'server configuration error, unknown login type' }],
    };
  }
  return { user: { ...user, loginType: gqlLoginType } };
}

export async function signInWithEmail(supabase: SupabaseClient, email: string, password: string) {
  const { user, session, error } = await supabase.auth.signIn({
    email,
    password,
  });
  return { user, session, error };
}

export async function signUpWithEmail(supabase: SupabaseClient, email: string, password: string) {
  const { user, session, error } = await supabase.auth.signUp(
    {
      email,
      password,
    },
    { redirectTo: process.env.REGISTER_REDIRECT },
  );
  return { user, session, error };
}

export async function validEmail(email: string, prisma: PrismaClient) {
  if (!emailRegex.test(email)) {
    return {
      errors: [
        {
          field: 'email',
          message: 'Please check your email address',
        },
      ],
    };
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    return {
      errors: [
        {
          field: 'email',
          message: 'User already exists. Please sign in.',
        },
      ],
    };
  }
  return {};
}

export async function validLoginUsername(username: string) {
  if (!/^[A-Z,a-z,0-9,-,_]+$/.test(username)) {
    return {
      errors: [
        {
          field: 'username',
          message: 'Please check your username.',
        },
      ],
    };
  }
  return {};
}

export async function validUsername(
  username: string,
  userLogin: UserLoginType,
  prisma: PrismaClient,
) {
  if (!/^[A-Z,a-z,0-9,-,_]+$/.test(username)) {
    return {
      errors: [
        {
          field: 'username',
          message: 'Please choose a username with only letters, numbers, underscores and hyphens.',
        },
      ],
    };
  }

  let loginType;
  switch (userLogin) {
    default:
      loginType = undefined;
      break;
    case UserLoginType.EMAIL:
      loginType = LoginType.EMAIL;
      break;
    case UserLoginType.GITHUB:
      loginType = LoginType.GITHUB;
      break;
  }

  if (await prisma.user.findFirst({ where: { username, loginType } })) {
    return {
      errors: [
        {
          field: 'username',
          message: 'Username is not currently available, please choose another.',
        },
      ],
    };
  }
  return {};
}

export function userLogin(loginType: LoginType) {
  let userLogin;
  switch (loginType) {
    default:
      userLogin = undefined;
      break;
    case LoginType.EMAIL:
      userLogin = UserLoginType.EMAIL;
      break;
    case LoginType.GITHUB:
      userLogin = UserLoginType.GITHUB;
      break;
  }
  return userLogin;
}
