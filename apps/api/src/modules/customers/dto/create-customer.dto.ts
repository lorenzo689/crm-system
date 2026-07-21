import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(50)
  customerNumber!: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
