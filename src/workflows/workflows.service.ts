import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from './workflow.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CompilerService } from './compiler/compiler.service';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(Workflow)
    private readonly repo: Repository<Workflow>,
    private readonly compilerService: CompilerService,
  ) {}

  async create(tenantId: string, dto: CreateWorkflowDto): Promise<Workflow> {
    this.compilerService.compile(dto.definition);
    const workflow = this.repo.create({
      ...dto,
      tenant_id: tenantId,
      version: 1,
    });
    return this.repo.save(workflow);
  }

  async findAll(tenantId: string): Promise<Workflow[]> {
    return this.repo.find({ where: { tenant_id: tenantId } });
  }

  async findOne(tenantId: string, id: string): Promise<Workflow> {
    const workflow = await this.repo.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return workflow;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWorkflowDto,
  ): Promise<Workflow> {
    const workflow = await this.findOne(tenantId, id);

    if (dto.definition) {
      this.compilerService.compile(dto.definition);
      workflow.version += 1;
    }

    Object.assign(workflow, dto);
    return this.repo.save(workflow);
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    const workflow = await this.findOne(tenantId, id);
    await this.repo.softRemove(workflow);
  }
}
