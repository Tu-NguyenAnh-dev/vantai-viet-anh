-- Trips có thể tạo "chưa gán xe/tài xế" (status = 'new') — TripsService.create() và CreateTripDto
-- đã hỗ trợ từ lâu, nhưng cột vehicle_id/driver_id trong schema gốc vẫn là NOT NULL, khiến
-- luồng tạo trip chưa gán xe/tài xế lỗi 500 ở tầng DB. Nới lỏng cho khớp business logic thật.
-- Idempotent: DROP NOT NULL không lỗi nếu cột đã nullable.
ALTER TABLE trips ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE trips ALTER COLUMN driver_id DROP NOT NULL;
