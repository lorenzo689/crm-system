import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentDto } from './create-document.dto';
import { UpdateDocumentDto } from './update-document.dto';

describe('CreateDocumentDto tags', () => {
  it('trims tags and removes duplicates', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      title: 'Preisliste',
      tags: ['  Vertrieb ', 'Aktuell', 'Vertrieb'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.tags).toEqual(['Vertrieb', 'Aktuell']);
  });

  it('rejects more than 20 tags', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      title: 'Preisliste',
      tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'tags')).toBe(true);
  });

  it('rejects tags longer than 40 characters after trimming', async () => {
    const dto = plainToInstance(CreateDocumentDto, {
      title: 'Preisliste',
      tags: [`  ${'x'.repeat(41)}  `],
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'tags')).toBe(true);
  });

  it('applies the same normalization and validation to updates', async () => {
    const dto = plainToInstance(UpdateDocumentDto, {
      tags: ['  Intern ', 'Intern'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.tags).toEqual(['Intern']);
  });
});
