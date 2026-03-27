// This file is created by egg-ts-helper@2.1.1
// Do not modify this file!!!!!!!!!
/* eslint-disable */

import 'egg';
import ExportCharacter from '../../../app/model/Character';
import ExportConversation from '../../../app/model/Conversation';
import ExportFriendship from '../../../app/model/Friendship';
import ExportMessage from '../../../app/model/Message';
import ExportNews from '../../../app/model/News';
import ExportNewsComment from '../../../app/model/NewsComment';
import ExportNewsRead from '../../../app/model/NewsRead';
import ExportNotification from '../../../app/model/Notification';
import ExportUser from '../../../app/model/User';
import ExportAiModel from '../../../app/model/AiModel';
import ExportCreditLog from '../../../app/model/CreditLog';
import ExportMembershipPlan from '../../../app/model/MembershipPlan';
import ExportDeviceToken from '../../../app/model/DeviceToken';
import ExportTopicCard from '../../../app/model/TopicCard';
import ExportVerificationCode from '../../../app/model/VerificationCode';

declare module 'egg' {
  interface IModel {
    Character: ReturnType<typeof ExportCharacter>;
    Conversation: ReturnType<typeof ExportConversation>;
    Friendship: ReturnType<typeof ExportFriendship>;
    Message: ReturnType<typeof ExportMessage>;
    News: ReturnType<typeof ExportNews>;
    NewsComment: ReturnType<typeof ExportNewsComment>;
    NewsRead: ReturnType<typeof ExportNewsRead>;
    Notification: ReturnType<typeof ExportNotification>;
    User: ReturnType<typeof ExportUser>;
    AiModel: ReturnType<typeof ExportAiModel>;
    CreditLog: ReturnType<typeof ExportCreditLog>;
    MembershipPlan: ReturnType<typeof ExportMembershipPlan>;
    DeviceToken: ReturnType<typeof ExportDeviceToken>;
    TopicCard: ReturnType<typeof ExportTopicCard>;
    VerificationCode: ReturnType<typeof ExportVerificationCode>;
  }
}
