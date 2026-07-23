import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  async findAll(organizationId: string) {
    return this.customersRepository.findAll(organizationId);
  }

  async findOne(id: string, organizationId: string) {
    const customer = await this.customersRepository.findById(
      id,
      organizationId,
    );
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async create(organizationId: string, dto: CreateCustomerDto) {
    const existing = await this.customersRepository.findByCustomerNumber(
      dto.customerNumber,
      organizationId,
    );
    if (existing) {
      throw new ConflictException('Customer number already exists');
    }

    return this.customersRepository.create({
      ...dto,
      organizationId,
    });
  }

  async update(id: string, organizationId: string, dto: UpdateCustomerDto) {
    await this.findOne(id, organizationId);

    if (dto.customerNumber) {
      const existing = await this.customersRepository.findByCustomerNumber(
        dto.customerNumber,
        organizationId,
      );
      if (existing && existing.id !== id) {
        throw new ConflictException('Customer number already exists');
      }
    }

    return this.customersRepository.update(id, dto);
  }

  async archive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.customersRepository.archive(id);
  }

  async unarchive(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.customersRepository.unarchive(id);
  }
}
