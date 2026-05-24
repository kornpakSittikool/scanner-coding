import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { UserService } from './user.service';

/**
 * Handles HTTP requests related to user accounts.
 */
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  async createUser(@Body() createDto: any) {
    return this.userService.create(createDto);
  }
}
