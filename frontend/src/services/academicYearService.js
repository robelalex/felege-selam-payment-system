// frontend/src/services/academicYearService.js
import api from './api'; // ✅ Use the api instance instead of axios

class AcademicYearService {
  async getAllYears() {
    const response = await api.get('/academic-years/');
    return response.data;
  }

  async getCurrentYear() {
    const response = await api.get('/academic-years/current/');
    return response.data;
  }

  async createYear(yearData) {
    const response = await api.post('/academic-years/', yearData);
    return response.data;
  }

  async setCurrentYear(yearId) {
    const response = await api.post(`/academic-years/${yearId}/set_current/`);
    return response.data;
  }

  async promoteStudents(yearId) {
    const response = await api.post(`/academic-years/${yearId}/promote_students/`);
    return response.data;
  }

  async createNextYear() {
    const response = await api.post('/academic-years/create_next_year/');
    return response.data;
  }

  async updateYear(yearId, yearData) {
    const response = await api.put(`/academic-years/${yearId}/`, yearData);
    return response.data;
  }

  async deleteYear(yearId) {
    const response = await api.delete(`/academic-years/${yearId}/`);
    return response.data;
  }
}

const academicYearService = new AcademicYearService();
export default academicYearService;