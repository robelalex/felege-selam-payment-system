// src/services/academicYearService.js
import api from './api';

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

  // ✅ NEW: Delete academic year
  async deleteYear(yearId) {
    const response = await api.delete(`/academic-years/${yearId}/`);
    return response.data;
  }

  // ✅ NEW: Archive academic year (soft delete)
  async archiveYear(yearId) {
    const response = await api.patch(`/academic-years/${yearId}/archive/`);
    return response.data;
  }

  // ✅ NEW: Restore archived year
  async restoreYear(yearId) {
    const response = await api.patch(`/academic-years/${yearId}/restore/`);
    return response.data;
  }

  // ✅ NEW: Get archived years
  async getArchivedYears() {
    const response = await api.get('/academic-years/archived/');
    return response.data;
  }
}

const academicYearService = new AcademicYearService();
export default academicYearService;