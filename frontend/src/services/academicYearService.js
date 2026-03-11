// frontend/src/services/academicYearService.js
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000/api/academic-years/';

class AcademicYearService {
  async getAllYears() {
    const response = await axios.get(API_URL);
    return response.data;
  }

  async getCurrentYear() {
    const response = await axios.get(`${API_URL}current/`);
    return response.data;
  }

  async createYear(yearData) {
    const response = await axios.post(API_URL, yearData);
    return response.data;
  }

  async setCurrentYear(yearId) {
    const response = await axios.post(`${API_URL}${yearId}/set_current/`);
    return response.data;
  }

  async promoteStudents(yearId) {
    const response = await axios.post(`${API_URL}${yearId}/promote_students/`);
    return response.data;
  }

  async createNextYear() {
    const response = await axios.post(`${API_URL}create_next_year/`);
    return response.data;
  }

  async updateYear(yearId, yearData) {
    const response = await axios.put(`${API_URL}${yearId}/`, yearData);
    return response.data;
  }

  async deleteYear(yearId) {
    const response = await axios.delete(`${API_URL}${yearId}/`);
    return response.data;
  }
}

export default new AcademicYearService();