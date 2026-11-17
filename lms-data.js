// Dữ liệu giới thiệu dùng chung; không phải dữ liệu chỗ trống từ máy chủ.
(() => {
  const courses = {
    'co-ban': {
      name: 'Tin học cơ bản',
      feeVnd: 1500000,
      message: 'Tự tin sử dụng máy tính, làm chủ công việc học tập và văn phòng hằng ngày.',
      audience: [
        'Người mới bắt đầu hoặc chưa sử dụng máy tính thành thạo.',
        'Học sinh, sinh viên cần kỹ năng tin học phục vụ học tập.',
        'Người đi làm muốn củng cố kỹ năng văn phòng nền tảng.'
      ],
      topics: [
        'Sử dụng máy tính, quản lý tệp và thư mục.',
        'Soạn thảo, định dạng văn bản bằng Word.',
        'Nhập dữ liệu, tính toán cơ bản và trình bày bảng tính Excel.',
        'Thiết kế bài trình chiếu PowerPoint.',
        'Sử dụng Internet, email và chia sẻ tài liệu.'
      ],
      outcomes: [
        'Tổ chức tài liệu cá nhân khoa học.',
        'Tạo được văn bản rõ ràng, đúng bố cục.',
        'Lập bảng tính và sử dụng công thức cơ bản.',
        'Hoàn thiện một bài trình chiếu phục vụ học tập hoặc công việc.'
      ],
      classes: [
        ['CB-01', 'Tống Hoàng Thiên', 'Thứ 2, thứ 4'],
        ['CB-02', 'Nguyễn Thái Tuấn', 'Thứ 3, thứ 5'],
        ['CB-03', 'Trần Anh Khoa', 'Thứ 6, chủ nhật']
      ]
    },
    'nang-cao': {
      name: 'Tin học nâng cao',
      feeVnd: 2500000,
      message: 'Nâng cao kỹ năng văn phòng, xử lý công việc hiệu quả và trình bày kết quả chuyên nghiệp.',
      audience: [
        'Người đã có kiến thức tin học cơ bản.',
        'Sinh viên chuẩn bị thực tập hoặc đi làm.',
        'Người thường xuyên xử lý văn bản, bảng số liệu và báo cáo.'
      ],
      topics: [
        'Word: định dạng tài liệu dài, mục lục, bảng biểu và trộn thư.',
        'Excel: hàm điều kiện, tổng hợp có điều kiện, tra cứu dữ liệu, lọc và sắp xếp.',
        'Tổng hợp số liệu bằng PivotTable và biểu đồ.',
        'PowerPoint: xây dựng bố cục, trình bày thông tin và sử dụng hiệu ứng hợp lý.',
        'Thực hành xử lý các tình huống văn phòng.'
      ],
      outcomes: [
        'Hoàn thiện tài liệu và báo cáo có cấu trúc.',
        'Xây dựng bảng tính phục vụ quản lý, thống kê.',
        'Tổng hợp và trình bày dữ liệu dễ hiểu.',
        'Tạo bài thuyết trình rõ ràng, chuyên nghiệp.'
      ],
      classes: [
        ['NC-01', 'Tống Hoàng Thiên', 'Thứ 3, thứ 5'],
        ['NC-02', 'Nguyễn Thái Tuấn', 'Thứ 6, chủ nhật'],
        ['NC-03', 'Trần Anh Khoa', 'Thứ 2, thứ 4']
      ]
    }
  };
  const time = '19:00–21:00';
  const capacity = 99;
  const classes = Object.fromEntries(Object.entries(courses).flatMap(([courseKey, course]) =>
    course.classes.map(([code, teacher, days]) => [code, {code, courseKey, courseName: course.name, teacher, days, time, fee:course.feeVnd.toLocaleString('vi-VN')+'đ/khóa', capacity}])
  ));
  window.THVP_LMS_DATA = Object.freeze({courses, classes, time, capacity});
})();
