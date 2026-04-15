import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppController {
  @Get()
  redirectToApp(@Res() res: Response) {
    return res.redirect('/app');
  }

  @Get('app')
  serveApp(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'public', 'index.html'));
  }
}
