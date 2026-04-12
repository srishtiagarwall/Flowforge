import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly repo: Repository<Tenant>,
  ) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.repo.create({
      ...dto,
      api_key: `ff_${randomUUID().replace(/-/g, '')}`,
    });
    return this.repo.save(tenant);
  }

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { api_key: apiKey } });
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.repo.findOne({ where: { id } });
  }
}
