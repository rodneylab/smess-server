import { Field, ObjectType } from 'type-graphql';
// import Message from './Message';

export enum UserLoginType {
  EMAIL = 'email',
  GITHUB = 'github',
}

@ObjectType()
class User {
  @Field()
  uid!: string;

  @Field()
  userId!: string;

  @Field()
  loginType!: UserLoginType;

  @Field()
  username!: string;

  @Field()
  email!: string;

  // @Field(() => [Message], { nullable: true })
  // messages: Message[];

  @Field(() => String)
  createdAt: Date;

  @Field(() => String)
  updatedAt: Date;
}

export { User as default };
