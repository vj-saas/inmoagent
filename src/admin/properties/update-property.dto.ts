import { PartialType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';

/** Igual que CreatePropertyDto pero con todos los campos opcionales (no incluye fotos, ver README). */
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}
