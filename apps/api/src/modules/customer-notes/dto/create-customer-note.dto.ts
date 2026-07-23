import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCustomerNoteDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
