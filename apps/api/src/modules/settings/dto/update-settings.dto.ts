import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import {
  CalendarViewSetting,
  Density,
  LandingPage,
  TaskView,
  Theme,
} from '../../../../generated/prisma/client';

export class UpdateSettingsDto {
  @IsOptional()
  @IsEnum(Theme)
  theme?: Theme;

  @IsOptional()
  @IsEnum(Density)
  density?: Density;

  @IsOptional()
  @IsEnum(TaskView)
  defaultTaskView?: TaskView;

  @IsOptional()
  @IsBoolean()
  showCompletedTasks?: boolean;

  @IsOptional()
  @IsEnum(CalendarViewSetting)
  calendarDefaultView?: CalendarViewSetting;

  @IsOptional()
  @IsEnum(LandingPage)
  defaultLandingPage?: LandingPage;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  taskReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  calendarReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  overdueTaskAlerts?: boolean;
}
