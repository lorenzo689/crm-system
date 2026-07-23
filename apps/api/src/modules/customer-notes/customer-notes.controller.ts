import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategies';
import { UsersService } from '../users/users.service';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { CustomerNotesService } from './customer-notes.service';

@UseGuards(JwtAuthGuard)
@Controller('customer-notes')
export class CustomerNotesController {
  constructor(
    private readonly customerNotesService: CustomerNotesService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async findAllByCustomer(
    @Query('customerId') customerId: string,
    @Req() req: Request,
  ) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.customerNotesService.findAllByCustomer(
      customerId,
      organizationId,
    );
  }

  @Post()
  async create(@Body() dto: CreateCustomerNoteDto, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.customerNotesService.create(payload.sub, organizationId, dto);
  }

  @Post(':id/archive')
  async archive(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as JwtPayload;
    const organizationId = await this.usersService.getOrganizationId(
      payload.sub,
    );
    return this.customerNotesService.archive(id, organizationId);
  }
}
