import { Field, ObjectType } from 'type-graphql';
import User from './User';

@ObjectType()
class Message {
  @Field()
  uid!: string;

  @Field(() => String)
  createdAt: Date;

  @Field(() => String)
  updatedAt: Date;

  @Field(() => String)
  messageBody: String;

  @Field(() => User)
  user!: User;
}

export { Message as default };
