import { IsDateString } from 'class-validator';

export class CreateReminderDto {
  @IsDateString()
  remindAt!: string;
}
